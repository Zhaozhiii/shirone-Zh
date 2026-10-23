import { expect, test } from "@playwright/test";

test("empty blog keeps homepage, archive and feeds usable", async ({
	page,
	request,
}) => {
	const response = await page.goto("/");
	expect(response?.status()).toBe(200);
	test.skip(
		(await page.locator('a[href^="/posts/"]').count()) > 0,
		"Empty-state assertions apply only while no posts are published",
	);
	await expect(page.locator("[data-empty-posts]")).toHaveText("暂无数据");
	await expect(page.locator('a[href^="/posts/"]')).toHaveCount(0);
	const licenseLink = page.locator("#site-info").getByRole("link", {
		name: "CC BY-NC-SA 4.0",
		exact: true,
	});
	await expect(licenseLink).toHaveAttribute(
		"href",
		"https://creativecommons.org/licenses/by-nc-sa/4.0/",
	);
	await page.locator('#navbar a[href="/archive/"]').first().click();
	await expect(page).toHaveURL(/\/archive\/?$/);
	await expect(page.locator("#swup-container")).toHaveAttribute(
		"data-current-page",
		"archive",
	);
	await page.reload();
	await expect(licenseLink).toHaveAttribute(
		"href",
		"https://creativecommons.org/licenses/by-nc-sa/4.0/",
	);
	await expect(page.locator("#swup-container")).toHaveAttribute(
		"data-current-page",
		"archive",
	);
	for (const [path, tag] of [
		["/rss.xml", "item"],
		["/atom.xml", "entry"],
	]) {
		const feed = await request.get(path);
		expect(feed.status()).toBe(200);
		expect(await feed.text()).not.toMatch(new RegExp(`<${tag}[\\s>]`));
	}
	expect((await request.get("/posts/guide/")).status()).toBe(404);
	for (const path of ["/AGENTS/", "/images/albums/AGENTS.md"]) {
		expect((await request.get(path)).status(), path).toBe(404);
	}
});

test("wallpaper controls preserve transparency across navigation and reload", async ({
	page,
}) => {
	await page.goto("/");
	await page.locator("#display-settings-switch").click();
	await page.getByRole("tab", { name: "壁纸", exact: true }).click();
	await page.getByText("覆盖透明", { exact: true }).click();
	await expect(page.locator("html")).toHaveAttribute(
		"data-wallpaper-mode",
		"overlay",
	);
	await expect(page.locator("#banner-wrapper")).toBeVisible();
	await page.getByRole("slider", { name: "背景模糊度", exact: true }).fill("8");
	await page
		.getByRole("slider", { name: "卡片透明度", exact: true })
		.fill("70");
	await page.locator("#display-settings-switch").click();
	await page.locator('#navbar a[href="/archive/"]').first().click();
	await expect(page.locator("#swup-container")).toHaveAttribute(
		"data-current-page",
		"archive",
	);
	await expect(page.locator("html")).toHaveAttribute(
		"data-wallpaper-mode",
		"overlay",
	);
	await page.reload();
	await expect(page.locator("html")).toHaveAttribute(
		"data-wallpaper-mode",
		"overlay",
	);
	await expect(page.locator("#banner-wrapper")).toBeVisible();
	await expect
		.poll(() =>
			page
				.locator("html")
				.evaluate((el) => el.style.getPropertyValue("--overlay-blur")),
		)
		.toBe("8px");
	await expect
		.poll(() =>
			page
				.locator("html")
				.evaluate((el) =>
					el.style.getPropertyValue("--card-transparent-opacity"),
				),
		)
		.toBe("0.7");
});

test("wallpaper hero remains responsive on mobile", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	await page.locator("#display-settings-switch").click();
	await page.getByRole("tab", { name: "壁纸", exact: true }).click();
	await page.getByText("全屏壁纸", { exact: true }).click();
	await page.getByText("Hero 模式", { exact: true }).click();
	await expect(page.locator("html")).toHaveAttribute(
		"data-wallpaper-mode",
		"fullscreen",
	);
	await expect(page.locator("html")).toHaveAttribute(
		"data-fullscreen-layout",
		"hero",
	);
	await page.reload();
	await expect(page.locator("#banner-wrapper")).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
});
