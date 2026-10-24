import { toString as mdastText } from "mdast-util-to-string";

export function visibleText(node) {
	function content(node) {
		if (
			node.data?.hProperties?.["data-pagefind-ignore"] ||
			node.data?.hProperties?.popover
		)
			return { type: "text", value: "" };
		return node.children
			? { ...node, children: node.children.map(content) }
			: node;
	}
	return mdastText(content(node));
}
