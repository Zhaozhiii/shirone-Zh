import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { noteText, types } from "./core.mjs";
import { domains } from "./model.mjs";
const root = resolve(process.argv[2] || "artifacts/vault-fixture");
mkdirSync(root, { recursive: true });
writeFileSync(
	join(root, "About.md"),
	noteText(
		{ type: "page", key: "about", publish: true },
		"Public theme fixture.\n",
	),
);
writeFileSync(
	join(root, "Private.md"),
	noteText(
		{ type: "article", publish: false },
		"PRIVATE_VAULT_FIXTURE_MUST_NOT_LEAK\n",
	),
);
// Exercise empty native Properties in the real CI check/build, including every supported type.
for (const [type, domain] of Object.entries(types)) {
	if (type === "page") continue; // About.md already owns the special about route.
	const data = {
		type,
		publish: true,
		cover: null,
		date: null,
		order: null,
		draft: null,
		visible: null,
	};
	for (const [field, [, kind, required, options]] of Object.entries(
		domains[domain]?.fields || {},
	)) {
		data[field] = !required
			? null
			: options
				? options[0]
				: kind === "number"
					? 0
					: ["tags", "objects", "images", "photos", "specs", "links"].includes(
								kind,
							)
						? []
						: kind === "boolean"
							? false
							: ["date", "datetime"].includes(kind) || field === "date"
								? "2026-10-24"
								: kind === "image"
									? ""
									: kind === "url"
										? "https://example.com/"
										: `${type}-${field}`;
	}
	if (type === "link") data.url = "https://example.com/";
	if (type === "anime") {
		data.progress = { watched: 0, total: null };
		data.period = { start: null, end: "2026-10" };
	}
	if (type === "aboutTechGroup")
		data.items = [
			{ name: "Example", desc: null, icon: null, color: null, url: null },
		];
	writeFileSync(
		join(root, `${type}.md`),
		noteText(data, "Public synthetic theme fixture.\n"),
	);
}
console.log("Public-only test fixture ready");
