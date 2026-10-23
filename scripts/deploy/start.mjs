import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createBlogServer } from "./server.mjs";

const root = resolve(process.env.SITE_ROOT || "dist");
const metadata = JSON.parse(
	readFileSync(resolve(root, "../release.json"), "utf8"),
);
const server = createBlogServer({
	root,
	release: metadata.release,
	code: metadata.code,
	content: metadata.content,
});
server.listen(Number(process.env.PORT || 3103), "0.0.0.0", () => {
	console.log(
		`Shirone ${metadata.release} listening on ${server.address().port}`,
	);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		server.close(() => process.exit(0));
		setTimeout(() => process.exit(1), 8000).unref();
	});
}
