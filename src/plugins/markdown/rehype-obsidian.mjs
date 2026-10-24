import rehypeKatex from "rehype-katex";
import { i18n } from "../../i18n/translation.ts";
import { walk } from "./core/obsidian.mjs";

/** Fresh macros per document: gdef works within a page, never across pages. */
export function rehypeDocumentKatex() {
	return (tree, file) => {
		if (file.data.astro.frontmatter.__markdownContext?.target === "feed")
			return;
		rehypeKatex({ macros: {}, globalGroup: true, trust: false })(tree, file);
		const messages = file.messages.filter(
			(message) => message.source === "rehype-katex",
		);
		if (messages.length) {
			file.data.astro.frontmatter.markdownDiagnostics ??= [];
			file.data.astro.frontmatter.markdownDiagnostics.push(
				...messages.map(() => ({ code: "math", source: "", line: undefined })),
			);
		}
	};
}

/** Runs after component rendering; only newly introduced reference DOM is styled. */
export function rehypeObsidian() {
	return (tree, file) => {
		const namespace = file.data.astro.frontmatter.__markdownContext?.namespace;
		if (namespace) {
			const ids = new Set();
			walk(tree, (node) => {
				if (node.properties?.id) ids.add(node.properties.id);
			});
			walk(tree, (node) => {
				const properties = node.properties;
				if (!properties) return;
				if (properties.id) properties.id = namespace + properties.id;
				if (
					typeof properties.href === "string" &&
					properties.href.startsWith("#")
				) {
					let id;
					try {
						id = decodeURIComponent(properties.href.slice(1));
					} catch {
						return;
					}
					if (ids.has(id)) properties.href = `#${namespace}${id}`;
				}
				for (const field of [
					"ariaControls",
					"ariaDescribedBy",
					"ariaLabelledBy",
					"aria-controls",
					"aria-describedby",
					"aria-labelledby",
					"popoverTarget",
					"popovertarget",
				]) {
					const value = properties[field];
					if (Array.isArray(value))
						properties[field] = value.map((id) =>
							ids.has(id) ? namespace + id : id,
						);
					else if (typeof value === "string")
						properties[field] = value
							.split(" ")
							.map((id) => (ids.has(id) ? namespace + id : id))
							.join(" ");
				}
			});
		}
		walk(tree, (node, parent) => {
			if (node.type !== "element") return;
			if (node.tagName === "img" && node.properties["data-obsidian-size"])
				node.properties.style = `${node.properties.style || ""};width:${node.properties.width}px;max-width:100%;height:${node.properties.height ? `${node.properties.height}px` : "auto"}`;
			if (
				node.tagName === "input" &&
				node.properties.type === "checkbox" &&
				!node.properties["aria-label"]
			) {
				const label = (node) =>
					node.type === "text"
						? node.value
						: (node.children || []).map(label).join("");
				node.properties["aria-label"] = label(parent).trim() || i18n("mdTask");
			}
		});
	};
}
