import { visit } from "unist-util-visit";

const ADMONITION_TYPES = "note|info|tip|important|warning|caution|details";
const GITHUB_ALERT = /^\s*\[!([a-z][\w-]*)\]([+-])?[ \t]*(.*)$/i;
const CALLOUT_TYPES = {
	note: "note",
	abstract: "info",
	summary: "info",
	tldr: "info",
	info: "info",
	todo: "info",
	tip: "tip",
	hint: "tip",
	important: "important",
	success: "tip",
	check: "tip",
	done: "tip",
	question: "warning",
	help: "warning",
	faq: "warning",
	warning: "warning",
	caution: "caution",
	attention: "warning",
	failure: "caution",
	fail: "caution",
	missing: "caution",
	danger: "caution",
	error: "caution",
	bug: "caution",
	example: "important",
	quote: "note",
	cite: "note",
};
const CONTAINER_OPENER = new RegExp(
	`^([\\t ]{0,3})(:{3,})[\\t ]*(${ADMONITION_TYPES})(?![\\w-])(.*)$`,
	"i",
);
const FENCE_OPENER = /^[\t ]{0,3}(`{3,}|~{3,})/;

function escapeAttribute(value) {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

/**
 * Normalizes Plume-style spaced container openers into remark-directive syntax.
 * Existing bracket labels and directive attributes pass through unchanged.
 */
export function rewriteAdmonitionContainers(source) {
	if (typeof source !== "string" || !source.includes(":::")) return source;

	let fence = null;
	return source
		.split(/(\r?\n)/)
		.map((part) => {
			if (part === "\n" || part === "\r\n") return part;

			const fenceMatch = part.match(FENCE_OPENER);
			if (fenceMatch) {
				const marker = fenceMatch[1];
				if (!fence) {
					fence = { character: marker[0], length: marker.length };
				} else if (
					marker[0] === fence.character &&
					marker.length >= fence.length &&
					new RegExp(
						`^[\\t ]{0,3}${fence.character}{${fence.length},}[\\t ]*$`,
					).test(part)
				) {
					fence = null;
				}
				return part;
			}

			if (fence) return part;
			const match = part.match(CONTAINER_OPENER);
			if (!match) return part;

			const [, indent, marker, rawType, rawSuffix] = match;
			const type = rawType.toLowerCase();
			const directiveName = type === "details" ? "admonition-details" : type;
			const suffix = rawSuffix.trim();
			if (!suffix) return `${indent}${marker}${directiveName}`;
			if (suffix.startsWith("[") || suffix.startsWith("{")) {
				return `${indent}${marker}${directiveName}${suffix}`;
			}
			if (!/^[\\t ]/.test(rawSuffix)) return part;
			return `${indent}${marker}${directiveName}{title="${escapeAttribute(suffix)}"}`;
		})
		.join("");
}

function normalizeGithubAlerts(tree) {
	visit(tree, "blockquote", (node, index, parent) => {
		if (typeof index !== "number" || !parent) return;
		normalizeGithubAlerts({ type: "root", children: node.children });
		const [firstParagraph, ...remainingBlocks] = node.children;
		if (firstParagraph?.type !== "paragraph") return;
		const [firstText, ...remainingInline] = firstParagraph.children;
		if (firstText?.type !== "text") return;

		const [declaration, ...remainingLines] = firstText.value.split("\n");
		const match = declaration.match(GITHUB_ALERT);
		if (!match) return;

		const rawType = match[1].toLowerCase();
		const type = CALLOUT_TYPES[rawType] || "note";
		let titleChildren = match[3] ? [{ type: "text", value: match[3] }] : [];
		const bodyInline = [];
		let inTitle = remainingLines.length === 0;
		for (const child of remainingInline) {
			if (inTitle && child.type === "text" && child.value.includes("\n")) {
				const [line, ...rest] = child.value.split("\n");
				if (line) titleChildren.push({ ...child, value: line });
				if (rest.join("\n"))
					bodyInline.push({ ...child, value: rest.join("\n") });
				inTitle = false;
			} else (inTitle ? titleChildren : bodyInline).push(child);
		}
		if (
			!titleChildren.length &&
			!["note", "tip", "important", "warning", "caution", "info"].includes(
				rawType,
			)
		)
			titleChildren = [{ type: "text", value: rawType.toUpperCase() }];
		const firstLine = remainingLines.join("\n");
		const paragraphChildren = [
			...(firstLine ? [{ ...firstText, value: firstLine }] : []),
			...bodyInline,
		];
		const alertChildren = [
			...(paragraphChildren.length > 0
				? [{ ...firstParagraph, children: paragraphChildren }]
				: []),
			...remainingBlocks,
		];

		parent.children[index] = {
			type: "containerDirective",
			name: type,
			attributes: {
				...(match[2] ? { fold: match[2] } : {}),
				"callout-type": rawType,
			},
			children: [
				...(titleChildren.length
					? [
							{
								type: "paragraph",
								data: { directiveLabel: true },
								children: titleChildren,
							},
						]
					: []),
				...alertChildren,
			],
		};
	});
}

export function remarkAdmonitions() {
	const parser = this.parser;
	if (typeof parser !== "function") {
		throw new TypeError(
			"remarkAdmonitions requires an initialized Markdown parser.",
		);
	}

	this.parser = function parseAdmonitions(source) {
		return parser(rewriteAdmonitionContainers(source));
	};

	return normalizeGithubAlerts;
}
