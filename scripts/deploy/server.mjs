import { createServer } from "node:http";
import { resolve } from "node:path";
import handler from "serve-handler";

const STATIC_HEADERS = [
	{ source: "**", headers: [{ key: "Cache-Control", value: "no-cache" }] },
	{
		source: "_astro/**",
		headers: [
			{ key: "Cache-Control", value: "public, max-age=31536000, immutable" },
		],
	},
	...[
		["atom.xml", "application/atom+xml"],
		["rss.xml", "application/rss+xml"],
		["llms*.txt", "text/markdown"],
	].map(([source, type]) => ({
		source,
		headers: [{ key: "Content-Type", value: `${type}; charset=utf-8` }],
	})),
];

/** Serve only the generated site; never expose the release directory itself. */
export function createBlogServer({
	root,
	release = "development",
	code,
	content,
}) {
	const health = JSON.stringify({ status: "ok", release, code, content });
	const options = {
		public: resolve(root),
		cleanUrls: true,
		trailingSlash: true,
		directoryListing: false,
		symlinks: false,
		headers: STATIC_HEADERS,
	};
	return createServer(async (request, response) => {
		response.setHeader("X-Content-Type-Options", "nosniff");
		response.setHeader("Cache-Control", "no-cache");
		if (!["GET", "HEAD"].includes(request.method)) {
			response.writeHead(405, { Allow: "GET, HEAD" });
			response.end();
			return;
		}
		let pathname;
		try {
			pathname = decodeURIComponent((request.url || "/").split("?")[0]);
		} catch {
			response.writeHead(400);
			response.end();
			return;
		}
		if (pathname.split("/").some((part) => part.startsWith("."))) {
			response.writeHead(404);
			response.end();
			return;
		}
		if (pathname === "/healthz") {
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(request.method === "HEAD" ? undefined : health);
			return;
		}
		try {
			await handler(request, response, options);
		} catch (error) {
			console.error("Static request failed:", error.message);
			if (!response.headersSent) response.writeHead(500);
			response.end();
		}
	});
}
