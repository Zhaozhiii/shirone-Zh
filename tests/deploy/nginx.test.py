"""Run the production snippet in an isolated Nginx container, never on live data."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
import uuid

IMAGE = "nginx@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class NginxTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="shirone-nginx-test-")
        cls.addClassCleanup(cls.tmp.cleanup)
        cls.root = Path(cls.tmp.name)
        cls.root.chmod(0o755)
        cls.name = "shirone-nginx-test-" + uuid.uuid4().hex[:12]
        cls.addClassCleanup(lambda: subprocess.run(["docker", "rm", "-f", cls.name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        for sha in ["a" * 40, "b" * 40]:
            target = cls.root / "releases" / sha
            files = {
                "dist/index.html": f"<h1>{sha}</h1>",
                "dist/posts/example/index.html": "<h1>Article</h1>",
                "dist/404.html": "<h1>Missing page</h1>",
                "dist/_astro/site.ABC.js": "console.log('ok');",
                "dist/audio.mp3": "0123456789",
                "dist/atom.xml": "<feed/>",
                "dist/rss.xml": "<rss/>",
                "dist/llms-full.txt": "# Content",
                "dist/.env": "PRIVATE",
                "dist/_astro/.env": "PRIVATE",
                "release.json": "PRIVATE",
                "health.json": json.dumps({"status": "ok", "release": sha, "code": "c" * 40, "content": "d" * 40}),
            }
            for name, content in files.items():
                path = target / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
            (target / "dist/leak.txt").symlink_to("../release.json")
        (cls.root / "current").symlink_to("releases/" + "a" * 40)
        (cls.root / "nginx.conf").write_text('events {}\nhttp { include /etc/nginx/mime.types; server { listen 8080; include /etc/nginx/snippets/shirone-blog.conf; } }\n')
        snippet = Path(__file__).resolve().parents[2] / "deploy/nginx-blog.conf"
        subprocess.run(["docker", "run", "--detach", "--name", cls.name, "--publish", "127.0.0.1::8080", "--volume", f"{cls.root}:/site:ro", "--volume", f"{snippet}:/etc/nginx/snippets/shirone-blog.conf:ro", IMAGE, "nginx", "-c", "/site/nginx.conf", "-g", "daemon off;"], check=True, stdout=subprocess.DEVNULL)
        port = subprocess.check_output(["docker", "port", cls.name, "8080"], text=True).strip().rsplit(":", 1)[1]
        cls.origin = f"http://127.0.0.1:{port}"
        cls.opener = urllib.request.build_opener(NoRedirect)
        for _ in range(40):
            try:
                with urllib.request.urlopen(cls.origin, timeout=1) as response:
                    if response.status == 200:
                        break
            except (OSError, urllib.error.URLError):
                time.sleep(0.1)
        else:
            raise RuntimeError(subprocess.check_output(["docker", "logs", cls.name], stderr=subprocess.STDOUT, text=True))

    def request(self, path="/", method="GET", headers=None):
        try:
            response = self.opener.open(urllib.request.Request(self.origin + path, method=method, headers=headers or {}), timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()

    def test_pages_redirects_custom_404_and_methods(self):
        self.assertEqual(self.request()[0], 200)
        status, headers, _ = self.request("/posts/example?x=1")
        self.assertEqual(status, 301)
        self.assertEqual(urllib.parse.urlsplit(headers["Location"]).path, "/posts/example/")
        self.assertEqual(urllib.parse.urlsplit(headers["Location"]).query, "x=1")
        self.assertIn(b"Article", self.request("/posts/example/")[2])
        status, _, body = self.request("/missing")
        self.assertEqual(status, 404)
        self.assertIn(b"Missing page", body)
        self.assertEqual(self.request(method="HEAD")[2], b"")
        status, headers, _ = self.request(method="POST")
        self.assertEqual(status, 405)
        self.assertEqual(headers["Allow"], "GET, HEAD")

    def test_mime_cache_range_and_conditionals(self):
        self.assertEqual(self.request()[1]["Cache-Control"], "no-cache")
        status, headers, _ = self.request("/_astro/site.ABC.js")
        self.assertEqual(status, 200)
        self.assertIn("javascript", headers["Content-Type"])
        self.assertIn("immutable", headers["Cache-Control"])
        self.assertEqual(self.request("/_astro/site.ABC.js", headers={"If-None-Match": headers["ETag"]})[0], 304)
        for path, mime in [("/atom.xml", "application/atom+xml"), ("/rss.xml", "application/rss+xml"), ("/llms-full.txt", "text/markdown")]:
            with self.subTest(path=path):
                self.assertIn(mime, self.request(path)[1]["Content-Type"])
                self.assertIn("charset=utf-8", self.request(path)[1]["Content-Type"])
        status, headers, body = self.request("/audio.mp3", headers={"Range": "bytes=2-5"})
        self.assertEqual((status, body), (206, b"2345"))
        self.assertEqual(headers["Content-Range"], "bytes 2-5/10")
        self.assertEqual(self.request("/audio.mp3", headers={"Range": "bytes=100-200"})[0], 416)

    def test_private_paths_and_symlinks_are_not_served(self):
        for path in ["/.env", "/%2eenv", "/_astro/.env", "/release.json", "/health.json", "/SHA256SUMS", "/server.cjs", "/leak.txt"]:
            with self.subTest(path=path):
                status, headers, body = self.request(path)
                self.assertIn(status, [403, 404])
                self.assertNotIn(b"PRIVATE", body)
                self.assertEqual(headers["X-Content-Type-Options"], "nosniff")

    def test_version_switch_and_rollback_need_no_restart(self):
        started = subprocess.check_output(["docker", "inspect", "-f", "{{.State.StartedAt}}", self.name], text=True)
        for char in ["a", "b", "a"]:
            temporary = self.root / "next"
            temporary.symlink_to("releases/" + char * 40)
            os.replace(temporary, self.root / "current")
            status, headers, body = self.request("/healthz")
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)["release"], char * 40)
            self.assertEqual(headers["Cache-Control"], "no-cache")
            self.assertIn((char * 40).encode(), self.request()[2])
        self.assertEqual(started, subprocess.check_output(["docker", "inspect", "-f", "{{.State.StartedAt}}", self.name], text=True))


if __name__ == "__main__":
    unittest.main()
