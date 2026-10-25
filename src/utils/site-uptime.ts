/** Persistent sidebar: refresh elapsed days without waiting for another build. */
export function initSiteUptime() {
	const update = () => {
		for (const element of document.querySelectorAll<HTMLElement>(
			"[data-site-start]",
		)) {
			const start = Date.parse(element.dataset.siteStart ?? "");
			if (!Number.isFinite(start)) continue;
			element.textContent = Math.max(
				0,
				Math.floor((Date.now() - start) / 86_400_000),
			).toLocaleString("en-US");
		}
	};
	update();
	window.setInterval(update, 60_000);
	document.addEventListener("visibilitychange", update);
}
