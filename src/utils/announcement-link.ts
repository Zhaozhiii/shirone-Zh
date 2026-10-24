/** Turn same-site absolute URLs into paths so Swup handles them like navigation tabs.
 * The exact site host is authoritative; parent and sibling domains stay external.
 */
export function announcementLink(
	href: string,
	site: string,
): { href: string; external: boolean } {
	try {
		const base = new URL(site);
		const target = new URL(href, base);
		if (
			/^https?:$/.test(target.protocol) &&
			target.hostname === base.hostname &&
			target.port === base.port
		) {
			return {
				href: `${target.pathname}${target.search}${target.hash}`,
				external: false,
			};
		}
		return { href, external: /^https?:$/.test(target.protocol) };
	} catch {
		return { href, external: /^https?:\/\//i.test(href) };
	}
}
