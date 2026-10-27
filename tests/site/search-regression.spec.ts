import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/");
	await expect(
		page.locator('astro-island[component-url*="/Search."]'),
	).toHaveCount(1);
	await expect(
		page.locator('astro-island[component-url*="/Search."][ssr]'),
	).toHaveCount(0);
	await page.evaluate(async () => {
		const target = window as unknown as {
			pagefind: unknown;
			__loadPagefind?: () => Promise<unknown>;
		};
		// Complete the production lazy loader before installing deterministic results.
		if (target.__loadPagefind) await target.__loadPagefind();
		target.pagefind = {
			search: async () => ({
				results: [
					{
						data: async () => ({
							url: "/about/",
							meta: { title: "Search result" },
							excerpt: "Example",
						}),
					},
				],
			}),
		};
		document.dispatchEvent(new Event("pagefindready"));
	});
	await page.locator(".top-app-bar__search-shell").click();
});

test("clearing desktop search clears results and closes the panel", async ({
	page,
}) => {
	await page.locator("#search-input-desktop").fill("example");
	await expect(
		page.locator(".m3-blog-searchpanel__item").first(),
	).toBeVisible();
	await page.locator("#search-input-desktop").fill("");
	await expect(page.locator(".m3-blog-searchpanel__item")).toHaveCount(0);
	await expect(page.locator("#search-panel")).toHaveClass(/float-panel-closed/);
});

for (const nextQuery of ["new", ""]) {
	test(`late search responses cannot overwrite ${nextQuery ? "new results" : "a cleared query"}`, async ({
		page,
	}) => {
		test.skip(
			!process.env.PLAYWRIGHT_PRODUCTION,
			"Pagefind runs only in production builds",
		);
		await page.evaluate(() => {
			const state = window as unknown as {
				pagefind: unknown;
				releaseOld: () => void;
				oldStarted: boolean;
				oldResolved: boolean;
			};
			const oldGate = new Promise<void>((resolve) => {
				state.releaseOld = resolve;
			});
			state.pagefind = {
				search: async (query: string) => ({
					results: [
						{
							data: async () => {
								if (query === "old") {
									state.oldStarted = true;
									await oldGate;
									state.oldResolved = true;
								}
								return {
									url: "/about/",
									meta: {
										title: query === "old" ? "Old result" : "New result",
									},
									excerpt: query,
								};
							},
						},
					],
				}),
			};
		});
		await page.locator("#search-input-desktop").fill("old");
		await page.waitForFunction(
			() => (window as unknown as { oldStarted: boolean }).oldStarted,
		);
		await page.locator("#search-input-desktop").fill(nextQuery);
		if (nextQuery)
			await expect(page.locator(".m3-blog-searchpanel__title")).toHaveText(
				"New result",
			);
		await page.evaluate(async () => {
			(window as unknown as { releaseOld: () => void }).releaseOld();
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			);
		});
		if (nextQuery)
			await expect(page.locator(".m3-blog-searchpanel__title")).toHaveText(
				"New result",
			);
		else
			await expect(page.locator(".m3-blog-searchpanel__item")).toHaveCount(0);
	});
}
