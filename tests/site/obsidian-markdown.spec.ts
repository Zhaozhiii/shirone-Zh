import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { unified } from "@astrojs/markdown-remark";
import { createNoteIndex } from "../../src/plugins/markdown/core/obsidian.mjs";
import { remarkObsidianSyntax } from "../../src/plugins/markdown/core/obsidian-syntax.mjs";
import { remarkObsidian } from "../../src/plugins/markdown/remark-obsidian.mjs";
import { siteMarkdownProcessor, siteRemarkPlugins, siteRehypePlugins } from "../../src/utils/markdown-processor.mjs";
import { getMarkdownStylesheetAssets } from "../../src/utils/markdown-assets";

const source = readFileSync("tests/fixtures/obsidian-markdown.md", "utf8");
const renderer = await siteMarkdownProcessor.createRenderer({});
const index = createNoteIndex([
	{ path: "Example.md", url: "/example/", body: source },
	{ path: "Public.md", url: "/public/", body: "# Section\nPublic embedded body.\n\n[[#Section]]" },
	{ path: "Private.md", public: false },
]);
const rendered = await renderer.render(source, { context: { index, current: "Example.md" } });

async function mount(page: Page, code = rendered.code, metadata = rendered.metadata) {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--mc-primary").trim().startsWith("#"));
	const packs = await getMarkdownStylesheetAssets(metadata.frontmatter.markdownSyntaxes);
	await page.evaluate(({ code, packs }) => {
		const root = document.createElement("article");
		root.className = "prose dark:prose-invert prose-base custom-md markdown-content";
		root.id = "markdown-compatibility-fixture";
		root.innerHTML = code;
		document.querySelector("#swup-container")!.replaceChildren(root);
		for (const { pack, css } of packs) {
			const style = document.createElement("style");
			style.dataset.swupOptional = pack; style.textContent = css; document.head.append(style);
		}
	}, { code, packs });
}

test("native unavailable-link popovers, folding, anchors and accessibility", async ({ page }) => {
	await mount(page);
	const root = page.locator("#markdown-compatibility-fixture");
	await expect(root).not.toContainText("COMMENT_SENTINEL_NOT_VISIBLE");
	const button = root.locator('[data-reference-status="unpublished"] button').first();
	const popover = page.locator(`#${await button.getAttribute("popovertarget")}`);
	await button.click(); await expect(popover).toBeVisible();
	await page.keyboard.press("Escape"); await expect(popover).not.toBeVisible();
	await button.focus(); await page.keyboard.press("Enter"); await expect(popover).toBeVisible();
	await page.keyboard.press("Escape");
	const callout = root.locator('details[data-callout="success"]');
	await expect(callout).not.toHaveAttribute("open");
	await callout.locator("summary").first().click(); await expect(callout).toHaveAttribute("open");
	await expect(root.locator('a[href="#embed-1-section"]').filter({ hasText: "Section" })).toBeVisible();
	const violations = (await new AxeBuilder({ page }).include("#markdown-compatibility-fixture").analyze()).violations;
	expect(violations).toEqual([]);
});

test("narrow layouts and no-JavaScript reading retain content", async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
	const page = await context.newPage();
	await page.goto("/");
	const css = readFileSync("src/styles/markdown/obsidian.css", "utf8");
	await page.setContent(`<style>${css}</style><article class="custom-md">${rendered.code}</article>`);
	await expect(page.locator(".obsidian-embed")).toContainText("Public embedded body");
	const button = page.locator('[data-reference-status="unpublished"] button').first();
	await button.click(); await expect(page.locator(`#${await button.getAttribute("popovertarget")}`)).toBeVisible();
	expect(await page.locator("body").evaluate((body) => body.scrollWidth <= innerWidth)).toBe(true);
	await context.close();
});

test("existing Shirone typography and components retain their computed appearance", async ({ page }) => {
	const baseline = unified({ gfm: true, smartypants: false, remarkPlugins: siteRemarkPlugins.filter((plugin: unknown) => plugin !== remarkObsidianSyntax && plugin !== remarkObsidian), rehypePlugins: siteRehypePlugins });
	const prose = "# Existing heading\n\nParagraph **strong** and *emphasis*.\n\n> Existing quote\n\n- First\n- Second\n\n:::tip[Original title]\nOriginal body.\n:::\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n$x^2$\n\n```js\nconst value = 1;\n```";
	const old = await (await baseline.createRenderer({})).render(prose);
	const updated = await renderer.render(prose);
	await mount(page, old.code, old.metadata);
	const measure = () => page.locator("#markdown-compatibility-fixture").evaluate((root) => [...root.querySelectorAll("h1,p,li,blockquote,table,.m3-admonition,.katex,pre")].map((node) => {
		const style = getComputedStyle(node); const box = node.getBoundingClientRect();
		return { tag: node.tagName, font: style.font, color: style.color, background: style.backgroundColor, margin: style.margin, padding: style.padding, radius: style.borderRadius, width: box.width, height: box.height };
	}));
	for (const theme of ["light", "dark"]) {
		await page.evaluate((theme) => document.documentElement.classList.toggle("dark", theme === "dark"), theme);
		const before = await measure();
		await page.locator("#markdown-compatibility-fixture").evaluate((root, html) => { root.innerHTML = html; }, updated.code);
		expect(await measure()).toEqual(before);
		await page.locator("#markdown-compatibility-fixture").evaluate((root, html) => { root.innerHTML = html; }, old.code);
	}
});

test("Mermaid common diagram families render through the existing runtime", async ({ page }) => {
	const diagrams = ["flowchart LR\nA-->B", "sequenceDiagram\nAlice->>Bob: Hello", "classDiagram\nAnimal <|-- Duck", "stateDiagram-v2\n[*] --> Ready", "gantt\ndateFormat YYYY-MM-DD\nsection Build\nTask :a1, 2026-01-01, 1d", "erDiagram\nUSER ||--o{ NOTE : owns", 'pie title Topics\n"Markdown" : 60\n"Other" : 40', "journey\ntitle Reading\nsection Day\nRead: 5: Me", "mindmap\n  root((Notes))\n    Markdown"];
	const result = await renderer.render(diagrams.map((diagram) => `\`\`\`mermaid\n${diagram}\n\`\`\``).join("\n\n"));
	await mount(page, result.code, result.metadata);
	await page.evaluate(async () => { const url = "/src/utils/markdown-runtime.ts"; const runtime = await import(url); await runtime.initMarkdownRuntime(document.querySelector("#markdown-compatibility-fixture")); });
	await expect(page.locator(".markdown-mermaid__diagram svg")).toHaveCount(diagrams.length, { timeout: 25000 });
});

test("Swup replacement and back navigation preserve native references and remove optional styles", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/", { waitUntil: "domcontentloaded" });
	const articleUrl = await page.locator('a[href^="/posts/"]').first().getAttribute("href");
	expect(articleUrl).toBeTruthy();
	await page.goto(articleUrl!, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--mc-primary").trim().startsWith("#"));
	const html = await (await page.request.get(articleUrl!)).text();
	const packs = await getMarkdownStylesheetAssets(rendered.metadata.frontmatter.markdownSyntaxes);
	const fixtureHtml = await page.evaluate(({ html, code, packs }) => {
		const document = new DOMParser().parseFromString(html, "text/html");
		document.querySelector(".markdown-content")!.innerHTML = code;
		for (const { pack, css } of packs) { const style = document.createElement("style"); style.dataset.swupOptional = pack; style.textContent = css; document.head.append(style); }
		return `<!DOCTYPE html>${document.documentElement.outerHTML}`;
	}, { html, code: rendered.code, packs });
	await page.route("**/__markdown-compat-fixture/", (route) => route.fulfill({ status: 200, contentType: "text/html", body: fixtureHtml }));
	await page.evaluate(() => {
		document.addEventListener("swup:content:replace", () => { document.documentElement.dataset.markdownSwup = "true"; }, { once: true });
		const link = document.createElement("a"); link.id = "compat-navigation"; link.href = "/__markdown-compat-fixture/"; link.textContent = "Compatibility fixture"; document.querySelector(".markdown-content")!.prepend(link);
	});
	await page.locator("#compat-navigation").click();
	await expect(page).toHaveURL(/__markdown-compat-fixture/);
	await expect(page.locator("html")).toHaveAttribute("data-markdown-swup", "true");
	const button = page.locator('[data-reference-status="unpublished"] button').first();
	await button.click(); await expect(page.locator(`#${await button.getAttribute("popovertarget")}`)).toBeVisible();
	await page.goBack();
	await expect(page).toHaveURL(new RegExp(encodeURI(articleUrl!)));
	await expect(page.locator(".obsidian-reference")).toHaveCount(0);
	await expect(page.locator('head [data-swup-optional="obsidian"]')).toHaveCount(0);
});
