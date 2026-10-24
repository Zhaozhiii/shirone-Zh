import assert from "node:assert/strict";
import { test } from "node:test";
import { createNoteIndex, prepareNote } from "../../../src/plugins/markdown/core/obsidian.mjs";
import { siteMarkdownProcessor } from "../../../src/utils/markdown-processor.mjs";

const renderer = await siteMarkdownProcessor.createRenderer({});
const notes = [
	{ path: "目录/A.md", title: "A", url: "/posts/a/", body: "# A" },
	{ path: "目录/B.md", title: "B", url: "/posts/b/", properties: { aliases: ["别名"] }, body: "# 开始\nintro\n\n## 小节\nText **bold** ^block\n\n[[#小节]]\n\nText[^n]\n\n[^n]: Footnote\n\n## 后续\nEnd" },
	{ path: "私人.md", public: false },
	{ path: "加密.md", title: "加密", url: "/posts/locked/", encrypted: true, body: "MUST_NOT_EMBED" },
];
const index = createNoteIndex(notes, { resolveAsset(value, origin) { return value === "图 片.png" && origin === "目录/B.md" ? { status: "valid", url: "/images/vault/image.png" } : { status: "missing" }; } });
const render = (source, extra = {}) => renderer.render(source, { context: { index, current: "目录/A.md", ...extra } });

test("strict CommonMark breaks, GFM, escapes and literal code remain intact", async () => {
	const { code } = await render("one\ntwo\n\nthree  \nfour\\\nfive\n\n~~delete~~\n\n- [x] task\n\n\\[[literal]] `[[code]]`\n\n```md\n![[私人]]\n%%literal%%\n```");
	assert.match(code, /one\ntwo/); assert.match(code, /three<br>\nfour<br>\nfive/);
	assert.match(code, /<del>delete<\/del>/); assert.match(code, /checked/);
	assert.match(code, /\[\[literal\]\]/); assert.match(code, /<code>\[\[code\]\]<\/code>/);
	assert.match(code.replace(/<[^>]+>/g, ""), /!\[\[私人\]\]/); assert.match(code, /%%literal%%/);
});
test("comments disappear before parsing headings, links, media, excerpts and statistics", async () => {
	const result = await render("%%\n# Hidden\n![[secret.png]]\n%%\n\nVisible %%SECRET%% text");
	assert.doesNotMatch(result.code, /Hidden|secret|SECRET/);
	assert.equal(result.metadata.headings.length, 0);
	assert.equal(result.metadata.frontmatter.excerpt, "Visible  text");
	assert.deepEqual(result.diagnostics, []);
});
test("wiki aliases, relative and encoded Markdown links share canonical headings and blocks", async () => {
	const { code } = await render("[[别名#小节|Go]] [MD](B.md#小节) [[B#^block]] [[B#开始#小节]]");
	assert.equal((code.match(/href="\/posts\/b\/#%E5%B0%8F%E8%8A%82"/g) || []).length, 3);
	assert.match(code, /href="\/posts\/b\/#block-block"/);
});
test("missing, private, ambiguous and out-of-root references invalidate only their own content", async () => {
	const { code, diagnostics } = await render("BEFORE [[私人|label]] ![[私人]] [[missing]] ![[../../outside.md]] AFTER");
	assert.match(code, /BEFORE/); assert.match(code, /AFTER/);
	assert.match(code, /data-reference-status="unpublished"/); assert.match(code, /popover="auto"/);
	assert.doesNotMatch(code, /href=".*(?:私人|outside)|<script/);
	assert.ok(diagnostics.some(({ code }) => code === "unpublished"));
	assert.ok(diagnostics.some(({ code }) => code === "outside"));
	assert.match((await render("[[私人|label]]", { target: "feed" })).code, /label \(.+\)/);
});
test("protected embeds expose only a notice and their public original URL", async () => {
	const { code } = await render("![[加密]] [[加密]]");
	assert.doesNotMatch(code, /MUST_NOT_EMBED/); assert.match(code, /data-reference-status="protected"/);
	assert.match(code, /href="\/posts\/locked\/"/);
});
test("section and block embeds isolate IDs, footnotes and local links", async () => {
	const { code } = await render("![[B#小节]]\n\n![[B#小节]]\n\n![[B#^block]]");
	assert.doesNotMatch(code, />后续<|>End</);
	assert.match(code, /id="embed-1-小节"/); assert.match(code, /href="#embed-1-小节"/);
	assert.match(code, /id="embed-2-小节"/);
	const ids = [...code.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
	assert.equal(ids.length, new Set(ids).size);
	assert.match(code, /Footnote/);
});

test("embedded local links to omitted sections jump to the original note", async () => {
	const context = createNoteIndex([{ path: "a.md", url: "/a/", body: "" }, { path: "b.md", url: "/b/", body: "# First\n[[#Second]]\n\n# Second\nOther" }]);
	const { code } = await renderer.render("![[b#First]]", { context: { index: context, current: "a.md" } });
	assert.match(code, /href="\/b\/#second"/);
	assert.doesNotMatch(code, /href="#embed-1-second"/);
});
test("recursive branches stop at cycles and budgets without rejecting sibling content", async () => {
	const cyclic = createNoteIndex([{ path: "a.md", url: "/a/", body: "![[b]]" }, { path: "b.md", url: "/b/", body: "![[a]]\n\nSTILL_VISIBLE" }]);
	const result = await renderer.render("![[b]]\n\nAFTER", { context: { index: cyclic, current: "a.md" } });
	assert.match(result.code, /data-reference-status="cycle"/); assert.match(result.code, /STILL_VISIBLE/); assert.match(result.code, /AFTER/);
	assert.ok(result.diagnostics.some(({ code }) => code === "cycle"));
});
test("native callouts reuse Shirone classes, rich titles, folding and nesting", async () => {
	for (const type of ["note", "abstract", "summary", "tldr", "info", "todo", "tip", "hint", "important", "success", "check", "done", "question", "help", "faq", "warning", "caution", "attention", "failure", "fail", "missing", "danger", "error", "bug", "example", "quote", "cite", "custom"]) {
		const { code } = await render(`> [!${type}]- **Title**\n> body\n>\n> > [!tip]+ nested\n> > child`);
		assert.equal((code.match(/<details/g) || []).length, 2, type);
		assert.match(code, /m3-admonition not-prose/); assert.match(code, /<strong>Title<\/strong>/); assert.match(code, / open/);
	}
});
test("KaTeX handles four delimiters and isolates gdef macros between documents", async () => {
	const { code } = await render("$x$ \\(y\\)\n\n$$\nz^2\n$$\n\n\\[\nw^2\n\\]");
	assert.equal((code.match(/class="katex"/g) || []).length, 4);
	assert.match((await render("$\\gdef\\mytestmacro{42}\\mytestmacro$ $\\mytestmacro$")).code, />42<|>4</);
	const other = await render("$\\mytestmacro$");
	assert.ok(other.diagnostics.some(({ code }) => code === "math"));
	const defined = await render("$\\newcommand{\\mynewmacro}{42}$ $\\mynewmacro$");
	assert.deepEqual(defined.diagnostics, []);
});
test("inline footnotes, scripts, emoji and nested tags remain static", async () => {
	const { code } = await render("H~2~O x^2^ :smile: #中文/标签 ^[**inline** footnote]");
	assert.match(code, /H<sub>2<\/sub>O/); assert.match(code, /x<sup>2<\/sup>/);
	assert.match(code, /😄/); assert.match(code, /archive\/\?tag=/); assert.match(code, /<strong>inline<\/strong>/);
	assert.doesNotMatch(code, /<script/);
});
test("raw HTML does not expand wiki syntax", async () => {
	assert.match((await render("<div>[[私人]] **literal**</div>")).code, /\[\[私人\]\]/);
});
test("duplicate headings and list block identifiers are stable", () => {
	const note = prepareNote("# 同名\n# 同名\n\n- a\n- b\n\n^list");
	assert.deepEqual(note.headings.map(({ id }) => id), ["同名", "同名-1"]);
	assert.equal(note.blocks.get("list").type, "list");
});

test("HTML anchors and heading block IDs coexist with canonical heading links", async () => {
	const source = '# Heading ^heading-block\n\n<span id="custom"></span>\n\n[[#Heading]] [[#^heading-block]] [HTML](#custom)';
	const { code, diagnostics } = await renderer.render(source);
	assert.deepEqual(diagnostics, []);
	assert.match(code, /id="heading"/); assert.match(code, /id="block-heading-block"/);
	assert.match(code, /href="#custom"/);
});

test("separate Markdown fragments on one page isolate generated IDs and popover targets", async () => {
	const first = await renderer.render("# Same\n\n[[missing]] ^[note]", { context: { namespace: "moment-a-" } });
	const second = await renderer.render("# Same\n\n[[missing]] ^[note]", { context: { namespace: "moment-b-" } });
	const html = first.code + second.code;
	const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
	assert.equal(ids.length, new Set(ids).size);
	assert.match(first.code, /popovertarget="moment-a-md-reference-1"/);
	assert.match(first.code, /href="#moment-a-same"/);
});

test("native Markdown image dimensions, audio and PDF preserve their controls and parameters", async () => {
	const { code } = await render('![300](/images/example.png)\n\n![Audio](https://example.test/audio.mp3)\n\n![PDF](https://example.test/doc.pdf#page=3&height=400)');
	assert.match(code, /width="300"/); assert.match(code, /<audio[^>]+controls/);
	assert.match(code, /<object[^>]+height="400"/); assert.match(code, /#page=3&#x26;height=400|#page=3&amp;height=400|#page=3&height=400/);
	const extensionless = await render('![caption](https://images.example.test/serve?id=1 "Caption")');
	assert.match(extensionless.code, /<img/); assert.match(extensionless.code, /Caption/); assert.deepEqual(extensionless.diagnostics, []);
});

test("source-relative HTML resources handle unquoted attributes and entities", async () => {
	const custom = createNoteIndex([{ path: "a.md", url: "/a/", body: "" }], { resolveAsset(value) { return value === "a&b.png" ? { status: "valid", url: "/images/encoded.png" } : { status: "missing" }; } });
	const { code } = await renderer.render('<img src=a&amp;b.png alt="test">', { context: { index: custom, current: "a.md" } });
	assert.match(code, /src="\/images\/encoded.png"/);
});

test("embed depth and instance budgets stop only the exhausted branch", async () => {
	const chain = createNoteIndex([{ path: "a.md", url: "/a/", body: "" }, { path: "b.md", url: "/b/", body: "![[c]]" }, { path: "c.md", url: "/c/", body: "deep" }]);
	const result = await renderer.render("![[b]]\n\nTAIL", { context: { index: chain, current: "a.md", maxDepth: 1 } });
	assert.ok(result.diagnostics.some(({ code }) => code === "limit")); assert.match(result.code, /TAIL/);
	const budget = await renderer.render(Array(201).fill("![[c]]").join("\n\n"), { context: { index: chain, current: "a.md" } });
	assert.equal((budget.code.match(/class="obsidian-embed"/g) || []).length, 200);
	assert.ok(budget.diagnostics.some(({ code }) => code === "limit"));
});
