import { expect, test } from "@playwright/test";

test.describe("Announcement Widget", () => {
	test("dismisses a card until its close duration expires", async ({
		page,
	}, testInfo) => {
		await page.goto("/", { waitUntil: "networkidle" });
		await page.evaluate(() => {
			localStorage.removeItem("announcementClosed");
			localStorage.removeItem("announcementClosedTime");
		});
		await page.reload({ waitUntil: "networkidle" });

		const announcement = page.locator('widget-layout[data-id="announcement"]');
		await expect(announcement).toBeVisible();
		await page.waitForFunction(() =>
			[...document.querySelectorAll(".onload-animation")].every(
				(el) =>
					(el as HTMLElement).offsetParent === null ||
					getComputedStyle(el).opacity === "1",
			),
		);
		await announcement.screenshot({
			path: testInfo.outputPath("announcement-cards.png"),
		});

		// 测试关闭功能
		const card = announcement.locator(".announcement-wrapper").first();
		const closeBtn = card.locator(".announcement-close-btn");
		await expect(closeBtn).toBeVisible();
		await closeBtn.click();
		await expect(card).toBeHidden();

		const version = await card.getAttribute("data-version");
		const closedTime = await page.evaluate(
			(version) => localStorage.getItem(`announcementClosed:${version}`),
			version,
		);
		expect(Number(closedTime)).toBeGreaterThan(0);

		// 刷新后在有效期内依然隐藏
		await page.reload({ waitUntil: "networkidle" });
		await expect(card).toBeHidden();

		// 模拟生命周期过期（将 closedTime 修改为 2 天前）
		await page.evaluate((version) => {
			const twoDaysAgo = Date.now() - 2 * 86400 * 1000;
			localStorage.setItem(
				`announcementClosed:${version}`,
				twoDaysAgo.toString(),
			);
		}, version);

		// 重新加载页面，验证公告重新展示且 localStorage 状态已重置
		await page.reload({ waitUntil: "networkidle" });
		await expect(card).toBeVisible();
		const clearedClosed = await page.evaluate(
			(version) => localStorage.getItem(`announcementClosed:${version}`),
			version,
		);
		expect(clearedClosed).toBeNull();
	});
});
