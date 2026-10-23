import { createServer } from "node:http";
import { resolve } from "node:path";
import handler from "serve-handler";

/** Serve only the generated site; never expose the release directory itself. */
export function createBlogServer({
	root,
	release = "development",
	code,
	content,
}) {
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
			response.end(
				request.method === "HEAD"
					? undefined
					: JSON.stringify({ status: "ok", release, code, content }),
			);
			return;
		}
		try {
			await handler(request, response, {
				public: resolve(root),
				cleanUrls: true,
				trailingSlash: true,
				directoryListing: false,
				symlinks: false,
				headers: [
					{
						source: "**",
						headers: [{ key: "Cache-Control", value: "no-cache" }],
					},
					{
						source: "_astro/**",
						headers: [
							{
								key: "Cache-Control",
								value: "public, max-age=31536000, immutable",
							},
						],
					},
					{
						source: "atom.xml",
						headers: [
							{
								key: "Content-Type",
								value: "application/atom+xml; charset=utf-8",
							},
						],
					},
					{
						source: "rss.xml",
						headers: [
							{
								key: "Content-Type",
								value: "application/rss+xml; charset=utf-8",
							},
						],
					},
					{
						source: "llms*.txt",
						headers: [
							{ key: "Content-Type", value: "text/markdown; charset=utf-8" },
						],
					},
				],
			});
		} catch (error) {
			console.error("Static request failed:", error.message);
			if (!response.headersSent) response.writeHead(500);
			response.end();
		}
	});
}
