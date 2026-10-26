import assert from "node:assert/strict";
import { test } from "node:test";
import { siteMarkdownProcessor } from "../../../src/utils/markdown-processor.mjs";

const renderer = await siteMarkdownProcessor.createRenderer({});
test("upstream renderer retains ordinary Markdown, GFM, footnotes and raw HTML", async () => {
	const { code } = await renderer.render(
		"# Heading\n\nParagraph **strong** *emphasis* ~~removed~~ `code`.\n\n- first\n- second\n\n1. numbered\n\n---\n\n> Ordinary quote\n\n[link](https://example.com)\n\n| A | B |\n| - | - |\n| one | two |\n\n- [x] Done\n- [ ] Pending\n\nFootnote[^note]\n\n[^note]: Footnote body\n\n<kbd>Ctrl</kbd>",
	);
	for (const pattern of [
		/<h1 id="heading">/,
		/<strong>strong<\/strong>/,
		/<em>emphasis<\/em>/,
		/<del>removed<\/del>/,
		/<code>code<\/code>/,
		/<ul>/,
		/<ol>/,
		/<hr>/,
		/<blockquote>/,
		/href="https:\/\/example.com"/,
		/<table>/,
		/type="checkbox" checked disabled/,
		/data-footnotes/,
		/Footnote body/,
		/<kbd>Ctrl<\/kbd>/,
	])
		assert.match(code, pattern);
});
test("upstream image widths, captions, alerts, math and Mermaid own their output", async () => {
	const { code, metadata } = await renderer.render(
		'![Description w-50%](/fixture.png "Caption")\n\n> [!NOTE]\n> Alert body\n\n:::details[More]\nDetails body\n:::\n\nInline $x^2$\n\n$$\nx + y\n$$\n\n```mermaid\nflowchart LR\n A --> B\n```\n\n```ts\nconst answer = 42;\n```',
	);
	for (const pattern of [
		/markdown-image-figure/,
		/alt="Description"/,
		/width: 50%/,
		/<figcaption class="markdown-image-caption">Caption<\/figcaption>/,
		/data-admonition="note"/,
		/<details[^>]*data-admonition="details"/,
		/class="katex"/,
		/class="katex-display"/,
		/class="markdown-mermaid"/,
		/data-language="ts"/,
	])
		assert.match(code, pattern);
	assert.ok(metadata.frontmatter.markdownSyntaxes.syntaxes.includes("math"));
	assert.ok(metadata.frontmatter.markdownSyntaxes.syntaxes.includes("mermaid"));
});
test("retired Obsidian syntax stays literal and cannot override upstream components", async () => {
	const { code } = await renderer.render(
		"[[Note|Alias]] ![[image.png|300]] %%comment%% ^[inline note] ^up^ ~down~\n\n> [!custom]- Title\n> Body\n\n> [!NOTE]- Folded title\n> Body\n\n![Description|300](/fixture.png)",
	);
	assert.match(code, /\[\[Note\|Alias\]\]/);
	assert.match(code, /%%comment%%/);
	assert.match(code, /<blockquote>/);
	assert.match(code, /alt="Description\|300"/);
	assert.doesNotMatch(
		code,
		/obsidian-|data-callout|data-admonition|width: 300|<sub>|<sup>/,
	);
});
