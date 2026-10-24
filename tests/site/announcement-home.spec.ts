import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Generated inputs only: never create test announcements in the user's Vault.
const configPath = resolve("src/user/user-config.ts");
let original: string;
test.beforeAll(async ({ request }) => {
	original = readFileSync(configPath, "utf8");
	const items = [
		{
			title: "Home announcement one",
			content: "First home notice",
			date: "2026-10-24",
			link: { text: "Read first notice", url: "https://blog.zhiii.top/about/" },
		},
		{
			title: "Home announcement two",
			content: "Second home notice",
			date: "2026-10-24 03:04:05",
			link: { text: "Read second notice", url: "https://zhiii.top/" },
		},
		{ title: "Bell only notice", content: "Not pushed to homepage" },
	];
	const fixture = {
		homeItems: items.slice(0, 2),
		board: { enable: true, items },
	};
	const next = original.replace(
		/const announcement: DeepPartial<AnnouncementConfig> = [\s\S]*?;\r?\n/,
		`const announcement: DeepPartial<AnnouncementConfig> = ${JSON.stringify(fixture)};\n`,
	);
	expect(next).not.toBe(original);
	writeFileSync(configPath, next);
	await expect
		.poll(
			async () => {
				try {
					return (await request.get("/")).text();
				} catch {
					return "";
				}
			},
			{ timeout: 60000 },
		)
		.toContain("First home notice");
});
test.afterAll(() => {
	if (original) writeFileSync(configPath, original);
});

test("pushed notices use separate cards without titles or dates and align their actions", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.setViewportSize({ width: 1280, height: 600 });
	await page.goto("/");
	const widget = page.locator('widget-layout[data-id="announcement"]');
	await expect(widget.locator(".announcement-item")).toHaveCount(2);
	await expect(widget).not.toContainText("Bell only notice");
	await expect(widget).not.toContainText("The only way to do great work");
	await expect(
		widget.getByRole("link", { name: "Read first notice" }),
	).toHaveAttribute("href", "/about/");
	await expect(
		widget.getByRole("link", { name: "Read first notice" }),
	).not.toHaveAttribute("target", "_blank");
	await expect(
		widget.getByRole("link", { name: "Read second notice" }),
	).toHaveAttribute("href", "https://zhiii.top/");
	await expect(
		widget.getByRole("link", { name: "Read second notice" }),
	).toHaveAttribute("target", "_blank");
	await expect(widget.locator("time")).toHaveCount(0);
	await expect(widget).not.toContainText("Home announcement one");
	await expect(widget).not.toContainText("Home announcement two");
	await expect(
		widget.locator(".announcement-wrapper > widget-layout > .m3-card"),
	).toHaveCount(2);
	await page.waitForFunction(() =>
		document.documentElement.style
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	for (const card of await widget.locator(".announcement-wrapper").all()) {
		const link = await card.locator(".announcement-btn").boundingBox();
		const close = await card.locator(".announcement-close-btn").boundingBox();
		expect(link).not.toBeNull();
		expect(close).not.toBeNull();
		expect(
			Math.abs(link!.y + link!.height / 2 - close!.y - close!.height / 2),
		).toBeLessThan(1);
	}
	const cards = await widget.locator(".announcement-wrapper").all();
	const first = await cards[0].boundingBox();
	const second = await cards[1].boundingBox();
	expect(second!.y - first!.y - first!.height).toBeGreaterThan(0);
	// The existing FAB policy reveals the bell after scrolling past the banner.
	await page.waitForFunction(() =>
		[...document.querySelectorAll(".onload-animation")].every(
			(el) =>
				(el as HTMLElement).offsetParent === null ||
				getComputedStyle(el).opacity === "1",
		),
	);
	await expect
		.poll(async () => {
			await page.evaluate(() =>
				window.scrollTo({
					top: document.documentElement.scrollHeight,
					behavior: "instant",
				}),
			);
			return page.evaluate(() => window.scrollY);
		})
		.toBeGreaterThan(210);
	await page.locator("#fab-board-btn").click();
	await expect(page.locator("#board-panel .board-panel__item")).toHaveCount(3);
	await expect(page.locator("#board-panel")).toContainText("Bell only notice");
	await expect(
		page
			.locator("#board-panel")
			.getByRole("link", { name: "Read second notice" }),
	).toHaveAttribute("target", "_blank");
	await page.evaluate(() => {
		(
			window as unknown as { announcementNavigationMarker: boolean }
		).announcementNavigationMarker = true;
	});
	await page
		.locator("#board-panel")
		.getByRole("link", { name: "Read first notice" })
		.click();
	await expect(page).toHaveURL(/\/about\//);
	await expect(page.locator("#board-panel")).toBeHidden();
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { announcementNavigationMarker: boolean })
					.announcementNavigationMarker,
		),
	).toBe(true);
});

test("dismissal survives Swup navigation and an older content version cannot hide new notices", async ({
	page,
}) => {
	await page.goto("/");
	const widget = page.locator('widget-layout[data-id="announcement"]');
	const cards = widget.locator(".announcement-wrapper");
	await cards.first().locator(".announcement-close-btn").click();
	await expect(cards.first()).toBeHidden();
	await expect(cards.nth(1)).toBeVisible();
	await page.locator('a[href="/archive/"]').first().click();
	await expect(page).toHaveURL(/archive/);
	await expect(cards.first()).toBeHidden();
	await page.locator('a[href="/"]').first().click();
	await expect(page).toHaveURL(/:\d+\/$/);
	await expect(cards.first()).toBeHidden();
	await expect(cards.nth(1)).toBeVisible();
	await page.reload();
	await expect(cards.first()).toBeHidden();
	await expect(cards.nth(1)).toBeVisible();
	await page.evaluate(() => {
		for (const key of Object.keys(localStorage))
			if (key.startsWith("announcementClosed:")) localStorage.removeItem(key);
		localStorage.setItem("announcementClosed", "true");
		localStorage.setItem("announcementClosedTime", String(Date.now()));
		localStorage.setItem(
			"announcementClosedVersion",
			"previous-content-version",
		);
	});
	await page.reload();
	await expect(widget).toBeVisible();
	await expect(widget.locator(".announcement-item")).toHaveCount(2);
	await expect(cards.first()).toBeVisible();
	await cards.first().locator(".announcement-close-btn").click();
	await cards.nth(1).locator(".announcement-close-btn").click();
	await expect(widget).toBeHidden();
});
