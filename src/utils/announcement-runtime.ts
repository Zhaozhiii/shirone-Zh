/** Sidebar dismissal applies to one content version; edits become visible immediately.
 * This utility owns persistence and rechecks the persistent shell after Swup.
 */
export function initAnnouncements(): void {
	const closedKey = "announcementClosed";
	const timeKey = "announcementClosedTime";
	const versionKey = "announcementClosedVersion";
	const widgets = () =>
		document.querySelectorAll<HTMLElement>(
			'widget-layout[data-id="announcement"]',
		);
	function refresh() {
		for (const widget of widgets()) {
			const wrapper = widget.querySelector<HTMLElement>(
				".announcement-wrapper",
			);
			const container =
				widget.closest<HTMLElement>(".sidebar-widget") || widget;
			const duration = Number(wrapper?.dataset.closeDuration ?? 86400);
			let hidden = false;
			try {
				const time = Number(localStorage.getItem(timeKey));
				hidden =
					localStorage.getItem(closedKey) === "true" &&
					localStorage.getItem(versionKey) === wrapper?.dataset.version &&
					(duration <= 0 ||
						(time > 0 && (Date.now() - time) / 1000 < duration));
				if (!hidden) {
					localStorage.removeItem(closedKey);
					localStorage.removeItem(timeKey);
					localStorage.removeItem(versionKey);
				}
			} catch {
				/* Storage can be unavailable; keep the announcement readable. */
			}
			container.style.display = hidden ? "none" : "";
			widget.style.display = hidden ? "none" : "";
		}
	}
	document.addEventListener("click", (event) => {
		const button =
			event.target instanceof Element
				? event.target.closest("[data-announcement-close]")
				: null;
		const wrapper = button?.closest<HTMLElement>(".announcement-wrapper");
		if (!wrapper) return;
		try {
			localStorage.setItem(closedKey, "true");
			localStorage.setItem(timeKey, String(Date.now()));
			localStorage.setItem(versionKey, wrapper.dataset.version || "");
		} catch {
			/* Dismiss for this page even without storage. */
		}
		for (const widget of widgets()) {
			const container =
				widget.closest<HTMLElement>(".sidebar-widget") || widget;
			container.style.display = "none";
		}
	});
	if (document.readyState === "loading")
		document.addEventListener("DOMContentLoaded", refresh);
	else refresh();
	document.addEventListener("swup:content:replace", refresh);
}
