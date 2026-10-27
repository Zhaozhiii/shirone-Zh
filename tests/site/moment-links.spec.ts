import { expect, test } from "@playwright/test";

test.describe("moment link regression (synthetic Vault)", () => {
	test.skip(
		!process.env.VAULT_LINK_ACCEPTANCE,
		"Requires tests/fixtures/moment-links-vault.mjs",
	);
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
	});

	for (const path of [
		"moments",
		"friends",
		"devices",
		"projects",
		"compass",
		"albums",
	]) {
		test(`${path} filters preserve unrelated parameters, anchors and history state`, async ({
			page,
		}) => {
			await page.goto(`/${path}/?keep=1#filter-marker`);
			await expect(page.getByRole("searchbox")).toBeVisible();
			await expect(
				page.locator("#swup-container astro-island[ssr]"),
			).toHaveCount(0);
			await page.evaluate(() =>
				history.replaceState({ ...history.state, regressionMarker: 42 }, ""),
			);
			await page.getByRole("searchbox").fill("example");
			await expect(page).toHaveURL(/\?keep=1&q=example#filter-marker$/);
			expect(await page.evaluate(() => history.state.regressionMarker)).toBe(
				42,
			);
			await page.getByRole("searchbox").fill("");
			await expect(page).toHaveURL(/\?keep=1#filter-marker$/);
		});
	}

	test("extensionless article links navigate through Swup and browser back", async ({
		page,
	}) => {
		await page.goto("/moments/");
		const link = page
			.locator("#moment-link-moment-1")
			.getByRole("link", { name: "设计文档" });
		await expect(link).toHaveAttribute("href", "/posts/link-target/");
		await expect(
			page.locator('astro-island[component-url*="MomentSection"][ssr]'),
		).toHaveCount(0);
		await page.evaluate(() => {
			(window as Window & { linkMarker?: boolean }).linkMarker = true;
		});
		await link.click();
		await expect(page).toHaveURL(/\/posts\/link-target\/$/);
		await expect(page.locator("#swup-container")).toContainText(
			"LINK_TARGET_BODY",
		);
		expect(
			await page.evaluate(
				() => (window as Window & { linkMarker?: boolean }).linkMarker,
			),
		).toBe(true);
		await page.goBack();
		await expect(page).toHaveURL(/\/moments\/$/);
		await expect(link).toBeVisible();
	});

	test("direct deep links reveal moments beyond the first page and retain the hash", async ({
		page,
	}) => {
		await page.goto("/moments/?keep=1#moment-link-moment-12");
		await expect(page.locator("#moment-link-moment-12")).toBeVisible();
		await expect(page).toHaveURL(/\?keep=1#moment-link-moment-12$/);
		await page.evaluate(() =>
			history.replaceState({ ...history.state, regressionMarker: 42 }, ""),
		);
		await page.getByRole("searchbox").fill("Link fixture");
		await expect(page).toHaveURL(
			/keep=1&q=Link\+fixture#moment-link-moment-12$/,
		);
		expect(await page.evaluate(() => history.state.regressionMarker)).toBe(42);
	});

	test("Swup deep links and same-page hash changes reveal older moments", async ({
		page,
	}) => {
		await page.goto("/posts/link-target/");
		await page.getByRole("link", { name: "Old moment", exact: true }).click();
		await expect(page).toHaveURL(/\/moments\/#moment-link-moment-12$/);
		await expect(page.locator("#moment-link-moment-12")).toBeVisible();
		await page.goto("/moments/");
		await expect(
			page.locator('astro-island[component-url*="MomentSection"][ssr]'),
		).toHaveCount(0);
		await page
			.locator("#moment-link-moment-1")
			.getByRole("link", { name: "Old moment" })
			.click();
		await expect(page.locator("#moment-link-moment-12")).toBeVisible();
		await expect(page).toHaveURL(/#moment-link-moment-12$/);
	});
});
