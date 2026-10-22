import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createBlogServer } from "../../scripts/deploy/server.mjs";

let directory;
let server;
let origin;
const release = "a".repeat(40);
before(async () => {
	directory = await mkdtemp(join(tmpdir(), "shirone-server-"));
	await mkdir(join(directory, "dist/posts/example"), { recursive: true });
	await mkdir(join(directory, "dist/_astro"), { recursive: true });
	for (const [name, content] of Object.entries({
		"dist/index.html": "<h1>Home</h1>",
		"dist/posts/example/index.html": "<h1>Article</h1>",
		"dist/404.html": "<h1>Missing page</h1>",
		"dist/_astro/site.ABC123.js": "console.log('ok');",
		"dist/audio.mp3": "0123456789",
		"dist/atom.xml": "<feed/>",
		"dist/rss.xml": "<rss/>",
		"dist/.env": "SECRET=private",
		"release.json": "private release metadata",
	}))
		await writeFile(join(directory, name), content);
	server = createBlogServer({ root: join(directory, "dist"), release });
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
	server?.closeAllConnections();
	if (server) await new Promise((resolve) => server.close(resolve));
	if (directory) await rm(directory, { recursive: true, force: true });
});
test("serves index pages, redirects directory URLs and returns a real custom 404", async () => {
	assert.match(await (await fetch(origin)).text(), /Home/);
	const redirect = await fetch(`${origin}/posts/example`, {
		redirect: "manual",
	});
	assert.equal(redirect.status, 301);
	assert.equal(redirect.headers.get("location"), "/posts/example/");
	assert.match(
		await (await fetch(`${origin}/posts/example/`)).text(),
		/Article/,
	);
	const missing = await fetch(`${origin}/missing`, {
		headers: { Accept: "text/html" },
	});
	assert.equal(missing.status, 404);
	assert.match(await missing.text(), /Missing page/);
});
test("provides release health, HEAD and restricted methods", async () => {
	assert.deepEqual(await (await fetch(`${origin}/healthz`)).json(), {
		status: "ok",
		release,
	});
	const head = await fetch(`${origin}/`, { method: "HEAD" });
	assert.equal(head.status, 200);
	assert.equal(await head.text(), "");
	assert.equal((await fetch(origin, { method: "POST" })).status, 405);
});
test("sets MIME and cache headers and supports byte ranges", async () => {
	const html = await fetch(origin);
	assert.match(html.headers.get("content-type"), /text\/html/);
	assert.equal(html.headers.get("cache-control"), "no-cache");
	const script = await fetch(`${origin}/_astro/site.ABC123.js`);
	assert.match(script.headers.get("content-type"), /javascript/);
	assert.match(script.headers.get("cache-control"), /immutable/);
	const audio = await fetch(`${origin}/audio.mp3`, {
		headers: { Range: "bytes=2-5" },
	});
	assert.equal(audio.status, 206);
	assert.equal(audio.headers.get("content-range"), "bytes 2-5/10");
	assert.equal(await audio.text(), "2345");
	assert.match(
		(await fetch(`${origin}/atom.xml`)).headers.get("content-type"),
		/application\/atom\+xml/,
	);
	assert.match(
		(await fetch(`${origin}/rss.xml`)).headers.get("content-type"),
		/application\/rss\+xml/,
	);
});
test("does not expose dotfiles, parent paths or directory listings", async () => {
	for (const path of [
		"/.env",
		"/%2eenv",
		"/%2e%2e/release.json",
		"/_astro/",
		"/release.json",
	]) {
		const response = await fetch(`${origin}${path}`);
		assert.equal(response.status, 404, path);
		assert.doesNotMatch(
			await response.text(),
			/SECRET=private|private release metadata|site\.ABC123/,
		);
	}
});
