import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { siteMarkdownProcessor } from "../../src/utils/markdown-processor.mjs";

for (const folder of ["src/content", "shirones/content", "custom-notes"]) {
	test(`upstream renderer works for ${folder} without a reference context`, async () => {
		const renderer = await siteMarkdownProcessor.createRenderer({});
		const { code } = await renderer.render(
			"# Title\n\n**Body** [[B]] ![[B]] $x$",
			{ fileURL: pathToFileURL(`${process.cwd()}/${folder}/posts/A.md`) },
		);
		assert.match(code, /<h1 id="title">/);
		assert.match(code, /<strong>Body<\/strong>/);
		assert.match(code, /class="katex"/);
		assert.match(code, /\[\[B\]\]/);
		assert.doesNotMatch(code, /obsidian-/);
	});
}
