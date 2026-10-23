import fs from "node:fs";
import { expect, test } from "@playwright/test";

const fixturePath = process.env.CMS_ACCEPTANCE_FIXTURE;
const live = process.env.CMS_LIVE_URL;
const fixture =
	fixturePath && fs.existsSync(fixturePath)
		? JSON.parse(fs.readFileSync(fixturePath, "utf8"))
		: null;
if (live) test.use({ baseURL: live });
test.skip(
	!fixture || !live,
	"Requires expired temporary CMS acceptance content on the live site",
);

test("expired details and their exclusive media return 404", async ({
	request,
}) => {
	expect(Date.now()).toBeGreaterThan(Date.parse(fixture.end));
	for (const path of [
		"/cms-acceptance/",
		"/cms-acceptance-locked/",
		"/cms-acceptance-draft/",
		"/series/cms-acceptance/",
		"/albums/cms-acceptance/",
		"/images/cms/cms-acceptance-cover.svg",
		"/images/cms/cms-acceptance-draft.svg",
	])
		expect((await request.get(path)).status(), path).toBe(404);
});

test("expired content disappears from public lists, feeds and sitemap", async ({
	request,
}) => {
	for (const path of [
		"/",
		"/archive/",
		"/categories/",
		"/tags/",
		"/series/",
		"/media/",
		"/rss.xml",
		"/atom.xml",
		"/llms.txt",
		"/llms-full.txt",
		"/sitemap-0.xml",
	]) {
		const response = await request.get(path);
		if (!response.ok()) continue;
		const text = await response.text();
		for (const value of [
			"CMS 定时发布验证",
			"CMS 密码验证",
			"CMS 验证书籍",
			"CMS 验证分类",
			"cms-acceptance",
			fixture.password,
			fixture.draftSecret,
			fixture.lockedSecret,
		])
			expect(text, path).not.toContain(value);
	}
});

test("rebuilt Pagefind has no expired CMS entries", async ({ page }) => {
	await page.goto("/");
	const count = await page.evaluate(async () => {
		const url = "/pagefind/pagefind.js";
		const pagefind = await import(/* @vite-ignore */ url);
		const result = await pagefind.search("CMS");
		return result.results.length;
	});
	expect(count).toBe(0);
});
