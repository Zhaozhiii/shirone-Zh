import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const cases = [
	{ id: "date-hidden-check", label: "", title: "Date hidden check" },
	{ id: "date-day-check", label: "2026-01-02", title: "Date day check" },
	{
		id: "date-time-check",
		label: "2026-01-02 03:04:05",
		title: "Date time check",
	},
];
test.beforeAll(async ({ request }) => {
	for (const item of cases)
		writeFileSync(
			resolve(`src/content/posts/${item.id}.md`),
			`---\ntitle: ${item.title}\nalias: ${item.id}\npublished: 2026-01-02\ndisplayDate: ${JSON.stringify(item.label)}\n---\n\nPublic date display fixture.\n`,
		);
	for (const item of cases)
		writeFileSync(
			resolve(`src/content/moments/${item.id}.md`),
			`---\npublished: 2026-01-02\ndisplayDate: ${JSON.stringify(item.label)}\n---\n\n${item.title}\n`,
		);
	await expect
		.poll(
			async () => (await request.get("/posts/date-hidden-check/")).status(),
			{ timeout: 15000 },
		)
		.toBe(200);
});
test.afterAll(() => {
	for (const item of cases)
		for (const domain of ["posts", "moments"])
			rmSync(resolve(`src/content/${domain}/${item.id}.md`), { force: true });
});
test("optional article dates render at the authored precision", async ({
	page,
}) => {
	for (const item of cases) {
		await page.goto(`/posts/${item.id}/`);
		const meta = page.locator(".m3-blog-postmeta");
		await expect(
			page.locator('[data-pagefind-meta="title"]').first(),
		).toContainText(item.title);
		if (item.label) await expect(meta).toContainText(item.label);
		else await expect(meta).not.toContainText("2026-01-02");
		if (item.label === "2026-01-02")
			await expect(meta).not.toContainText("00:00");
		await expect(page.locator("[data-banner-context-date]")).toHaveText(
			item.label,
		);
	}
});
test("undated and date-only moments do not manufacture a clock", async ({
	page,
}) => {
	await page.goto("/moments/");
	for (const item of cases) {
		const card = page.locator(".moment-card").filter({ hasText: item.title });
		if (item.label) await expect(card.locator("time")).toHaveText(item.label);
		else await expect(card.locator("time")).toHaveCount(0);
	}
});
test("date banner refreshes through Swup and undated metadata stays accessible", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/archive/");
	const group = page
		.locator(".m3-blog-archive__group")
		.filter({ has: page.locator('a[href="/posts/date-hidden-check/"]') });
	const header = group.getByRole("button");
	if ((await header.getAttribute("aria-expanded")) === "false")
		await header.click();
	await page.locator('a[href="/posts/date-hidden-check/"]').first().click();
	await expect(page).toHaveURL(/date-hidden-check/);
	await expect(page.locator(".m3-blog-postmeta")).not.toContainText(
		"2026-01-02",
	);
	await expect(page.locator("[data-banner-context-meta]")).toHaveAttribute(
		"hidden",
		"",
	);
	await page.waitForFunction(() =>
		document.documentElement.style
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	const results = await new AxeBuilder({ page })
		.disableRules(["page-has-heading-one"])
		.analyze();
	expect(results.violations.map((v) => v.id)).toEqual([]);
});

test("dated albums keep their password boundary with the active site language", async ({
	page,
}) => {
	await page.goto("/albums/EncryptedExample/");
	const input = page.getByRole("textbox", { name: /^(密码|Password)$/ });
	await expect(input).toHaveAttribute("type", "password");
	await expect(page.locator(".album-gallery__item")).toHaveCount(0);
	await input.fill("123456");
	await page.getByRole("button", { name: /^(解锁相册|Unlock album)$/ }).click();
	await expect(page.locator(".album-gallery__item")).toHaveCount(2);
});
