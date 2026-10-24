import { visibleText } from "./markdown/core/visible-text.mjs";

/* Use the post's first paragraph as the excerpt */
export function remarkExcerpt() {
	return (tree, { data }) => {
		let excerpt = "";
		for (const node of tree.children) {
			if (node.type !== "paragraph") {
				continue;
			}
			excerpt = visibleText(node);
			break;
		}
		data.astro.frontmatter.excerpt = excerpt;
	};
}
