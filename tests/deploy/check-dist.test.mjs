import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkDist } from "../../scripts/deploy/check-dist.mjs";

test("accepts site assets and rejects instruction files and generated instruction routes", async () => {
	const root = await mkdtemp(join(tmpdir(), "shirone-dist-"));
	try {
		await writeFile(join(root, "index.html"), "<h1>Blog</h1>");
		await checkDist(root);
		await mkdir(join(root, "images"));
		const notes = join(root, "images/AGENTS.md");
		await writeFile(notes, "Private development notes");
		await assert.rejects(checkDist(root), /must not be published/);
		await rm(notes);
		await mkdir(join(root, "AGENTS"));
		await assert.rejects(checkDist(root), /must not be published/);
		await rmdir(join(root, "AGENTS"));
		await writeFile(
			join(root, "sitemap-0.xml"),
			"<urlset><url><loc>https://blog.zhiii.top/AGENTS/</loc></url></urlset>",
		);
		await assert.rejects(checkDist(root), /found in sitemap/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
