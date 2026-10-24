import { domains } from "./model.mjs";

const textTypes = new Set([
	"text",
	"textarea",
	"url",
	"image",
	"category",
	"password",
]);
const structuredTypes = new Set([
	"object",
	"objects",
	"images",
	"photos",
	"links",
	"specs",
	"tags",
]);

function normalizeStructured(value, parents = new Set()) {
	if (value == null) return undefined;
	if (typeof value !== "object") return value;
	if (parents.has(value))
		throw new Error(
			"A public structured property contains a circular YAML alias",
		);
	parents.add(value);
	let result;
	if (Array.isArray(value)) {
		result = value
			.map((item) => normalizeStructured(item, parents))
			.filter(
				(item) =>
					item !== undefined &&
					!(typeof item === "string" && item.trim() === ""),
			);
	} else {
		result = Object.fromEntries(
			Object.entries(value)
				.map(([key, item]) => [key, normalizeStructured(item, parents)])
				.filter(([, item]) => item !== undefined),
		);
		if (Object.keys(result).length === 0) result = undefined;
	}
	parents.delete(value);
	return result;
}

/** Native Properties represent unset values as null; normalize before defaults and validation. */
export function normalizeNoteProperties(properties, domain) {
	const fields = {
		...domains[domain]?.fields,
		order: ["", "number"],
		draft: ["", "boolean"],
		visible: ["", "boolean"],
	};
	const data = {};
	for (const [key, value] of Object.entries(properties)) {
		if (value == null) continue;
		const type = fields[key]?.[1];
		if (value === "" && type && !textTypes.has(type)) continue;
		const normalized =
			properties.publish === true && structuredTypes.has(type)
				? normalizeStructured(value)
				: value;
		if (normalized !== undefined)
			Object.defineProperty(data, key, {
				value: normalized,
				enumerable: true,
				configurable: true,
				writable: true,
			});
	}
	// Renderer contracts require these values even though author-facing fields are optional.
	if (domain === "aboutTechGroups") {
		if (data.icon === undefined || data.icon === "")
			data.icon = "material-symbols:code-rounded";
		if (Array.isArray(data.items))
			data.items = data.items.map((item) =>
				item && typeof item === "object" && !Array.isArray(item)
					? {
							desc: "",
							icon: "material-symbols:code-rounded",
							color: "var(--primary)",
							url: "",
							...item,
						}
					: item,
			);
	}
	if (domain === "aboutSocialLinks") {
		data.brand ??= "";
		data.handle ??= "";
		if (data.icon === undefined || data.icon === "")
			data.icon = "material-symbols:link-rounded";
	}
	if (domain === "anime") {
		if (
			data.progress &&
			typeof data.progress === "object" &&
			!Array.isArray(data.progress)
		)
			data.progress = { watched: 0, total: 0, ...data.progress };
		if (
			data.period &&
			typeof data.period === "object" &&
			!Array.isArray(data.period)
		)
			data.period = { start: "", end: "", ...data.period };
	}
	return data;
}
