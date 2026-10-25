import { expect, test } from "@playwright/test";

test("site age advances from its fixed epoch and survives navigation", async ({
	page,
}) => {
	await page.clock.install({ time: new Date("2026-10-25T03:19:00+08:00") });
	await page.goto("/");
	const uptime = page.locator("[data-site-start]");
	await expect(uptime).toHaveAttribute(
		"data-site-start",
		"2026-10-23T03:20:00+08:00",
	);
	await expect(uptime).toHaveText("1");
	await page.clock.fastForward(60_000);
	await expect(uptime).toHaveText("2");
	await page.locator('a[href="/archive/"]').first().click();
	await page.waitForURL("**/archive/");
	await expect(uptime).toHaveText("2");
	await expect(
		page
			.locator(".site-info__card-value")
			.filter({ hasText: "2026年10月23日 03:20:00" }),
	).toHaveCount(1);
});
