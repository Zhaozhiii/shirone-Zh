"""Exercise real archive validation and atomic activation with isolated data."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("release", Path(__file__).resolve().parents[2] / "deploy/release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.root_patch = patch.object(release, "ROOT", self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        (self.root / "incoming").mkdir()
        (self.root / "releases").mkdir()

    def archive(self, sha, *, legacy=False, corrupt=False, dirty=False):
        metadata = {"release": sha, "code": "b" * 40, "content": "c" * 40, "dirty": dirty}
        health = {"status": "ok", **{k: metadata[k] for k in ("release", "code", "content")}}
        files = {"dist/index.html": b"<h1>Home</h1>", "release.json": json.dumps(metadata).encode()}
        if legacy:
            files["server.cjs"] = b"legacy runtime"
        else:
            files["health.json"] = json.dumps(health).encode()
        checksums = "".join(f"{hashlib.sha256(data).hexdigest()}  {name}\n" for name, data in files.items())
        files["SHA256SUMS"] = checksums.encode()
        if corrupt:
            files["dist/index.html"] = b"unexpected bytes"
        archive = self.root / "incoming" / f"{sha}.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            for name, data in files.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mode = 0o644
                tar.addfile(info, io.BytesIO(data))
        archive.with_suffix(".gz.sha256").write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + "  release.tar.gz\n")

    def test_static_archive_needs_no_node_runtime(self):
        sha = "a" * 40
        self.archive(sha)
        target = release.unpack(sha)
        self.assertFalse((target / "server.cjs").exists())
        self.assertEqual(json.loads((target / "health.json").read_text())["release"], sha)

    def test_legacy_release_gets_derived_health_without_changing_site(self):
        sha = "a" * 40
        self.archive(sha, legacy=True)
        target = release.unpack(sha)
        before = (target / "dist/index.html").read_bytes()
        release.prepare_health(target)
        self.assertEqual((target / "dist/index.html").read_bytes(), before)
        self.assertEqual(json.loads((target / "health.json").read_text())["status"], "ok")

    def test_bad_hash_or_dirty_release_is_not_installed(self):
        for sha, kwargs in [("a" * 40, {"corrupt": True}), ("d" * 40, {"dirty": True})]:
            with self.subTest(sha=sha):
                self.archive(sha, **kwargs)
                with self.assertRaises(ValueError):
                    release.unpack(sha)
                self.assertFalse((self.root / "releases" / sha).exists())

    def test_health_identity_cannot_be_forged(self):
        sha = "a" * 40
        self.archive(sha)
        target = release.unpack(sha)
        (target / "health.json").write_text('{"status":"ok"}')
        with self.assertRaisesRegex(ValueError, "Health metadata"):
            release.prepare_health(target)

    def test_failed_activation_restores_previous_site_then_valid_activation_records_it(self):
        old, new = "a" * 40, "d" * 40
        for sha in [old, new]:
            self.archive(sha)
            release.unpack(sha)
        try:
            release.link("current", f"releases/{old}")
        except OSError as error:
            self.skipTest(f"Symlink permission unavailable: {error}")
        with patch.object(release, "healthy", side_effect=[RuntimeError("unhealthy"), None]) as check:
            with self.assertRaisesRegex(RuntimeError, "unhealthy"):
                release.activate(new)
            self.assertEqual([c.args[0] for c in check.call_args_list], [new, old])
        self.assertEqual((self.root / "current").resolve().name, old)
        with patch.object(release, "healthy"):
            release.activate(new)
        self.assertEqual((self.root / "current").resolve().name, new)
        self.assertEqual((self.root / "previous").resolve().name, old)


if __name__ == "__main__":
    unittest.main()
