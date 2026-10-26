import {
	copyFileSync,
	existsSync,
	mkdirSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";

const article = resolve("src/content/posts/upstream-validation-fixture.md");
const image = resolve("public/images/upstream-validation.svg");
const route = "/posts/upstream-validation-fixture/";
let created = false;

test.beforeAll(async ({ request }) => {
	if (existsSync(article) || existsSync(image))
		throw new Error("Validation fixture paths must be unused");
	mkdirSync(dirname(article), { recursive: true });
	mkdirSync(dirname(image), { recursive: true });
	writeFileSync(
		image,
		'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320"><rect width="640" height="320" fill="#90a4ae"/></svg>',
	);
	copyFileSync(resolve("tests/fixtures/upstream-markdown.md"), article);
	created = true;
	// Astro must observe the temporary content before a browser requests its route.
	await expect
		.poll(async () => (await request.get(route)).status(), { timeout: 15_000 })
		.toBe(200);
});
test.afterAll(() => {
	if (created) {
		unlinkSync(article);
		unlinkSync(image);
	}
});

async function settled(page: import("@playwright/test").Page) {
	await page.waitForFunction(() =>
		document.documentElement.style
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	await page.waitForFunction(() =>
		[...document.querySelectorAll<HTMLElement>(".onload-animation")].every(
			(el) => el.offsetParent === null || getComputedStyle(el).opacity === "1",
		),
	);
}

test("direct load retains upstream layout, code, math, Mermaid, captions and lightbox", async ({
	page,
}) => {
	await page.goto(route);
	await settled(page);
	const root = page.locator(".custom-md").first();
	await expect(root.locator("strong")).toHaveText("strong");
	await expect(root.locator("table")).toHaveCount(1);
	await expect(root.locator("[data-footnotes]")).toContainText(
		"Upstream footnote body",
	);
	await expect(root.locator('[data-admonition="note"]')).toContainText(
		"Upstream alert body",
	);
	await expect(root.locator(".expressive-code")).toHaveCount(1);
	await expect(root.locator(".katex")).toHaveCount(2);
	await expect(root.locator("[data-mermaid-svg]")).toHaveCount(1, {
		timeout: 30_000,
	});
	await expect(root.locator(".markdown-image-caption")).toHaveText(
		"Upstream caption",
	);
	await expect(root.locator('img[alt="Local attachment"]')).toHaveCSS(
		"width",
		/px$/,
	);
	await expect(root).toContainText("[[Literal wiki]] %%literal comment%%");
	await expect(root.locator('[class*="obsidian-"]')).toHaveCount(0);
	await expect
		.poll(() => root.evaluate((el) => getComputedStyle(el).fontFamily))
		.not.toBe("");
	await root.locator('img[alt="Local attachment"]').click();
	await expect(page.locator(".fancybox__container")).toBeVisible();
	await page.keyboard.press("Escape");
});

test("Swup navigation removes optional syntax resources and preserves theme state", async ({
	page,
}) => {
	await page.goto(route);
	await settled(page);
	await page.evaluate(() => {
		(
			window as unknown as { validationNavigation: boolean }
		).validationNavigation = true;
	});
	await page
		.locator(".custom-md")
		.first()
		.getByRole("link", { name: "Visit home", exact: true })
		.click();
	await expect(page).toHaveURL(/\/$/);
	await settled(page);
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { validationNavigation: boolean })
					.validationNavigation,
		),
	).toBe(true);
	await expect(
		page.locator(
			'head [data-swup-optional="math"], head [data-swup-optional="mermaid"]',
		),
	).toHaveCount(0);
	await page.goBack();
	await expect(page).toHaveURL(new RegExp(route));
	await expect(page.locator(".custom-md .katex")).toHaveCount(2);
	await expect(page.locator("[data-mermaid-svg]")).toHaveCount(1, {
		timeout: 30_000,
	});
});

test("mobile and dark mode retain readable article geometry", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript(() => localStorage.setItem("theme", "dark"));
	await page.goto(route);
	await settled(page);
	await expect(page.locator("html")).toHaveClass(/dark/);
	await page.locator("#scheme-switch").click();
	await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "auto");
	await page.locator("#scheme-switch").click();
	await expect(page.locator("html")).toHaveAttribute(
		"data-theme-mode",
		"light",
	);
	await expect(page.locator("html")).not.toHaveClass(/dark/);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth + 1,
		),
	).toBe(true);
	await expect(
		page.locator(".custom-md .markdown-image-caption"),
	).toBeVisible();
});

test("SSR remains readable with JavaScript disabled", async ({ browser }) => {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		reducedMotion: "reduce",
	});
	try {
		const page = await context.newPage();
		await page.goto(
			`http://localhost:${process.env.PLAYWRIGHT_PORT || 4321}${route}`,
		);
		const root = page.locator(".custom-md").first();
		await expect(root.locator(".expressive-code")).toContainText(
			"const answer = 42",
		);
		await expect(root.locator(".katex")).toHaveCount(2);
		await expect(root.locator(".markdown-mermaid__fallback")).toContainText(
			"flowchart LR",
		);
		await root.locator("summary").press("Enter");
		await expect(root.locator("details")).toHaveAttribute("open", "");
	} finally {
		await context.close();
	}
});
