/** Dismiss each content version independently and recheck the persistent shell after Swup. */
export function initAnnouncements(): void {
	const dismissed = new Map<string, number>();
	const widgets = () =>
		document.querySelectorAll<HTMLElement>(
			'widget-layout[data-id="announcement"]',
		);
	const keyFor = (version: string) => `announcementClosed:${version}`;
	const active = (time: number, duration: number) =>
		time > 0 && (duration <= 0 || (Date.now() - time) / 1000 < duration);
	function refresh() {
		for (const widget of widgets()) {
			const wrappers = widget.querySelectorAll<HTMLElement>(
				".announcement-wrapper",
			);
			for (const wrapper of wrappers) {
				const version = wrapper.dataset.version || "";
				const duration = Number(wrapper.dataset.closeDuration ?? 86400);
				let hidden = active(dismissed.get(version) || 0, duration);
				try {
					const key = keyFor(version);
					const time = Number(localStorage.getItem(key));
					hidden ||= active(time, duration);
					if (time && !active(time, duration)) localStorage.removeItem(key);
					// Preserve existing whole-widget dismissals until their content or duration changes.
					hidden ||=
						localStorage.getItem("announcementClosed") === "true" &&
						localStorage.getItem("announcementClosedVersion") ===
							widget.dataset.version &&
						active(
							Number(localStorage.getItem("announcementClosedTime")),
							duration,
						);
				} catch {
					/* Page-local dismissal still works when storage is unavailable. */
				}
				wrapper.style.display = hidden ? "none" : "";
			}
			const hidden = [...wrappers].every(
				(wrapper) => wrapper.style.display === "none",
			);
			const container =
				widget.closest<HTMLElement>(".sidebar-widget") || widget;
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
		const version = wrapper.dataset.version || "";
		const time = Date.now();
		dismissed.set(version, time);
		try {
			localStorage.setItem(keyFor(version), String(time));
		} catch {
			/* Dismiss for this page even without storage. */
		}
		refresh();
	});
	if (document.readyState === "loading")
		document.addEventListener("DOMContentLoaded", refresh);
	else refresh();
	document.addEventListener("swup:content:replace", refresh);
}
