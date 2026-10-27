/** Update only the query string, retaining anchors and Swup's history entry. */
export function replaceFilterQuery(params: URLSearchParams): void {
	const target = new URL(window.location.href);
	target.search = params.toString();
	history.replaceState(
		history.state,
		"",
		target.pathname + target.search + target.hash,
	);
}
