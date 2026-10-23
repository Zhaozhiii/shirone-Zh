import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const fixturePath = process.env.CMS_ACCEPTANCE_FIXTURE;
const fixture =
	fixturePath && fs.existsSync(fixturePath)
		? JSON.parse(fs.readFileSync(fixturePath, "utf8"))
		: null;
const live = process.env.CMS_LIVE_URL;
if (live) test.use({ baseURL: live });
test.skip(
	!fixture,
	"Run with a temporary CMS acceptance fixture; never use personal passwords.",
);

test("media and ordered series are rendered as accessible SSR content", async ({
	request,
}) => {
	const media = await request.get("/media/");
	expect(media.ok()).toBe(true);
	expect(await media.text()).toContain("CMS 验证书籍（临时）");
	const series = await request.get("/series/cms-acceptance/");
	expect(series.ok()).toBe(true);
	const html = await series.text();
	expect(html.indexOf('href="/cms-acceptance/"')).toBeLessThan(
		html.indexOf('href="/cms-acceptance-locked/"'),
	);
});

test("parent categories include descendants and Swup navigation preserves route state", async ({
	page,
}) => {
	await page.goto("/archive/?category=cms-acceptance-parent");
	const panel = page.locator(".archive-panel");
	await panel.scrollIntoViewIfNeeded();
	await expect(
		panel.getByRole("link", { name: "CMS 定时发布验证（临时）" }),
	).toBeVisible();
	await panel.getByRole("link", { name: "CMS 定时发布验证（临时）" }).click();
	await expect(page).toHaveURL(/\/cms-acceptance\/$/);
	await expect(page.locator("#swup-container")).toHaveAttribute(
		"data-current-page",
		"post",
	);
	await expect(page.locator(".series-navigation")).toContainText(
		"CMS 验证系列",
	);
	await page.reload();
	await expect(page.locator(".series-navigation")).toContainText(
		"CMS 验证系列",
	);
});

test("protected posts reject wrong passwords, decrypt and restore after reload", async ({
	page,
	request,
}) => {
	const response = await request.get("/cms-acceptance-locked/");
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).not.toContain(fixture.password);
	expect(html).not.toContain(fixture.lockedSecret);
	await page.goto("/cms-acceptance-locked/");
	const gate = page.locator(".password-gate");
	await expect(gate).toBeVisible();
	const input = page.locator('input[name="password"]');
	await input.fill("incorrect-cms-password");
	await gate.locator('button[type="submit"]').click();
	await expect(gate).toContainText(/密码错误|Incorrect password|无法解锁/);
	await input.fill(fixture.password);
	await gate.locator('button[type="submit"]').click();
	await expect(page.locator(".markdown-content")).toContainText(
		fixture.lockedSecret,
	);
	await expect(gate).toBeHidden();
	await page.reload();
	await expect(page.locator(".markdown-content")).toContainText(
		fixture.lockedSecret,
	);
});

test("protected album preserves photo metadata after decryption", async ({
	page,
	request,
}) => {
	const response = await request.get("/albums/cms-acceptance/");
	expect(response.ok()).toBe(true);
	expect(await response.text()).not.toContain(fixture.password);
	await page.goto("/albums/cms-acceptance/");
	const gate = page.locator(".password-gate");
	await expect(gate).toBeVisible();
	await page.locator('input[name="password"]').fill(fixture.password);
	await gate.locator('button[type="submit"]').click();
	await expect(gate).toBeHidden();
	await expect(page.getByAltText("CMS 验证图片").first()).toBeVisible();
});

test("production never exposes drafts, private originals or album source manifests", async ({
	request,
}) => {
	test.skip(!live, "Production-only boundary check");
	for (const path of [
		"/cms-acceptance-draft/",
		"/images/cms/cms-acceptance-draft.svg",
		"/images/albums/cms-acceptance/info.json",
	]) {
		expect((await request.get(path)).status()).toBe(404);
	}
	for (const path of [
		"/",
		"/archive/",
		"/rss.xml",
		"/atom.xml",
		"/llms.txt",
		"/llms-full.txt",
	]) {
		const response = await request.get(path);
		if (!response.ok()) continue;
		const text = await response.text();
		expect(text).not.toContain(fixture.password);
		expect(text).not.toContain(fixture.draftSecret);
		expect(text).not.toContain(fixture.lockedSecret);
	}
});

test("production search finds published content without indexing drafts or protected text", async ({
	page,
	request,
}) => {
	test.skip(!live, "Production search index check");
	test.skip(
		!(await request.get("/cms-acceptance/")).ok(),
		"Acceptance window has ended",
	);
	await page.goto("/");
	const entries = await page.evaluate(async () => {
		const url = "/pagefind/pagefind.js";
		const pagefind = await import(/* @vite-ignore */ url);
		const result = await pagefind.search("CMS");
		return await Promise.all(
			result.results.map((r: { data: () => Promise<unknown> }) => r.data()),
		);
	});
	expect(entries.length).toBeGreaterThan(0);
	const text = JSON.stringify(entries);
	for (const value of [
		"cms-acceptance-draft",
		fixture.password,
		fixture.draftSecret,
		fixture.lockedSecret,
	])
		expect(text).not.toContain(value);
});

for (const path of ["/media/", "/series/", "/series/cms-acceptance/"]) {
	test(`CMS page has no WCAG AA violations: ${path}`, async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto(path);
		await page.waitForFunction(
			() =>
				getComputedStyle(document.documentElement)
					.getPropertyValue("--mc-primary")
					.trim() !== "",
		);
		const result = await new AxeBuilder({ page })
			.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
			.analyze();
		expect(result.violations).toEqual([]);
	});
}
