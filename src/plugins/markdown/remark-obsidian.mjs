import { i18n } from "../../i18n/translation.ts";
import { loadMarkdownContext } from "../../utils/markdown-context.mjs";
import {
	createNoteIndex,
	element,
	normalizeProperties,
	prepareNote,
	text,
	walk,
} from "./core/obsidian.mjs";
import { expandReferences } from "./core/obsidian-references.mjs";

export function referenceLabels() {
	return Object.fromEntries(
		Object.entries({
			unpublished: "mdReferenceUnpublished",
			missing: "mdReferenceMissing",
			ambiguous: "mdReferenceAmbiguous",
			outside: "mdReferenceUnavailable",
			protected: "mdEmbedProtected",
			cycle: "mdEmbedLimit",
			limit: "mdEmbedLimit",
			embed_unpublished: "mdEmbedUnpublished",
			embed_missing: "mdEmbedMissing",
			embed_ambiguous: "mdEmbedAmbiguous",
			embed_outside: "mdReferenceUnavailable",
			embed_protected: "mdEmbedProtected",
			embed_cycle: "mdEmbedLimit",
			embed_limit: "mdEmbedLimit",
			open: "mdReferenceOpen",
		}).map(([key, value]) => [key, i18n(value)]),
	);
}

export function remarkObsidian(options = {}) {
	const parse = (source) => this.parse(source);
	return (original, file) => {
		const prepared = prepareNote(original, parse);
		let context = loadMarkdownContext(
			file,
			parse,
			options.root,
			options.contentRoot,
		);
		// Standalone render calls still get working local headings and blocks.
		if (!context.current) {
			const baseIndex = context.index;
			const current = "__document.md";
			const index = createNoteIndex(
				[{ path: current, body: String(file.value), url: "", public: true }],
				{ parse },
			);
			context = {
				...context,
				current,
				index: {
					...baseIndex,
					resolve: (value, origin, wiki) =>
						value.startsWith("#")
							? index.resolve(value, current, wiki)
							: baseIndex.resolve(value, origin, wiki),
				},
			};
		}
		const labels = referenceLabels();
		const expanded = expandReferences(prepared.tree, { ...context, labels });
		const frontmatter = file.data.astro.frontmatter;
		frontmatter.markdownDiagnostics = expanded.diagnostics;
		const tags = new Set(normalizeProperties(frontmatter).tags);
		walk(expanded.tree, (node) => {
			if (node.data?.obsidianTag) tags.add(node.data.obsidianTag);
		});
		frontmatter.obsidianTags = [...tags];
		const backlinks = context.backlinks?.[context.current] || [];
		if (backlinks.length && context.target !== "feed")
			expanded.tree.children.push(
				element(
					"nav",
					[
						element("p", [text(i18n("mdBacklinks"))]),
						element(
							"ul",
							backlinks.map((link) =>
								element("li", [
									{ type: "link", url: link.url, children: [text(link.title)] },
								]),
							),
						),
					],
					{
						className: ["obsidian-backlinks"],
						"aria-label": i18n("mdBacklinks"),
						"data-pagefind-ignore": true,
					},
				),
			);
		const classes =
			context.index.entries.find((entry) => entry.path === context.current)
				?.properties.cssclasses || normalizeProperties(frontmatter).cssclasses;
		if (classes.length)
			expanded.tree.children = [
				element("div", expanded.tree.children, { className: classes }),
			];
		return expanded.tree;
	};
}
