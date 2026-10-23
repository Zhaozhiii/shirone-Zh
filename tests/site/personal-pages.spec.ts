import { expect, test } from "@playwright/test";

test("首页导航、社交图标及默认外观在桌面和手机端可用", async ({
	page,
}, testInfo) => {
	await page.addInitScript(() => localStorage.setItem("theme", "light"));
	await page.goto("/");
	await page.waitForFunction(() =>
		document.documentElement.style
			.getPropertyValue("--mc-primary")
			.startsWith("#"),
	);
	await expect(page.locator("#banner-wrapper")).toHaveAttribute(
		"data-subtitle-typewriter-pause-time",
		"10000",
	);
	await expect(page.locator(".banner-stage__link svg")).toHaveCount(3);
	await expect(page.locator("a[rel='me'] svg")).toHaveCount(6);
	const nav = page.locator(".top-app-bar__nav");
	await expect(nav).toContainText("网址导航");
	await expect(nav).not.toContainText("番剧");
	await expect(nav).not.toContainText("留言板");
	await expect(page.locator("#navbar > div > a")).toHaveCSS(
		"color",
		"rgb(255, 255, 255)",
	);
	await expect(nav.getByRole("link", { name: "电影书籍" })).toHaveCSS(
		"color",
		"rgb(255, 255, 255)",
	);
	await expect(page.locator("#display-settings-switch svg")).toHaveCSS(
		"color",
		"rgb(255, 255, 255)",
	);
	await expect(page.locator(".banner-stage__scrim")).toHaveAttribute(
		"style",
		/0\.42/,
	);
	await page.screenshot({
		path: testInfo.outputPath("personal-home-desktop.png"),
		fullPage: true,
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({
		path: testInfo.outputPath("personal-home-mobile.png"),
		fullPage: true,
	});
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await expect(page.locator("#nav-drawer-switch svg")).toHaveCSS(
		"color",
		"rgb(255, 255, 255)",
	);
	await page.evaluate(() => window.scrollTo(0, innerHeight));
	await expect(page.locator("body")).toHaveAttribute(
		"data-banner-scrolled",
		"true",
	);
	await expect(page.locator("#display-settings-switch svg")).not.toHaveCSS(
		"color",
		"rgb(255, 255, 255)",
	);
	await page.evaluate(() => window.scrollTo(0, 0));
	await expect(page.locator("#display-settings-switch svg")).toHaveCSS(
		"color",
		"rgb(255, 255, 255)",
	);
});

test("电影书籍空态支持直接访问及 Swup 导航", async ({ page }) => {
	await page.goto("/media/");
	await expect(
		page.getByRole("heading", { name: "电影书籍", exact: true }),
	).toBeVisible();
	await expect(page.locator(".media-section__empty")).toContainText("暂无");
	await expect(page.locator("#swup-container")).toHaveAttribute(
		"data-current-page",
		"media",
	);
	await page.goto("/");
	await page
		.locator(".top-app-bar__nav")
		.getByRole("link", { name: "电影书籍" })
		.click();
	await expect(page).toHaveURL(/\/media\/$/);
	await expect(page.locator("#swup-container")).toHaveAttribute(
		"data-current-page",
		"media",
	);
	await expect(page.locator(".media-section__empty")).toBeVisible();
});

test("邮件换链与两种收款码在手机端可用", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/friends/");
	await page.locator(".friend-guide").scrollIntoViewIfNeeded();
	await expect(page.locator(".friend-guide__step-title").nth(1)).toContainText(
		"邮箱留言",
	);
	await expect(page.locator(".friend-guide__contact-main")).toHaveCount(1);
	await expect(page.locator(".friend-guide__contact-main")).toHaveAttribute(
		"href",
		/^mailto:/,
	);
	await page.goto("/sponsor/");
	const codes = page.locator(".sponsor__qrcode");
	await expect(codes).toHaveCount(2);
	for (const code of await codes.all()) {
		await code.scrollIntoViewIfNeeded();
		await expect
			.poll(() =>
				code.evaluate(
					(img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
				),
			)
			.toBe(true);
	}
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
});
