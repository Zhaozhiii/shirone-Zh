import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { createSiteMarkdownProcessor } from "../../src/utils/markdown-processor.mjs";

for (const folder of ["src/content", "shirones/content", "custom-notes"]) {
	test(`explicit content root supports ${folder} without reading theme content`, async (t) => {
		const root = mkdtempSync(join(tmpdir(), "markdown-package-"));
		t.after(() => rmSync(root, { recursive: true, force: true }));
		const contentRoot = join(root, folder);
		const a = join(contentRoot, "posts/A.md"); const b = join(contentRoot, "posts/B.md");
		mkdirSync(dirname(a), { recursive: true });
		writeFileSync(a, "---\ntitle: A\n---\n[[B#标题]]\n\n![[B#标题]]");
		writeFileSync(b, "---\ntitle: B\naliases: [别名]\ncssclasses: [wide]\n---\n# 标题\nPUBLIC_PACKAGE_BODY");
		const renderer = await createSiteMarkdownProcessor({ root, contentRoot }).createRenderer({});
		const result = await renderer.render("[[别名#标题]]\n\n![[B#标题]]", { fileURL: pathToFileURL(a) });
		assert.match(result.code, /href="\/posts\/B\/#%E6%A0%87%E9%A2%98"/);
		assert.match(result.code, /PUBLIC_PACKAGE_BODY/); assert.deepEqual(result.diagnostics, []);
		const other = await renderer.render("# 标题\nPUBLIC_PACKAGE_BODY", { fileURL: pathToFileURL(b) });
		assert.match(other.code, /class="wide"/); assert.match(other.code, /obsidian-backlinks/);
	});
}
