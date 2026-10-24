import getReadingTime from "reading-time";
import { visibleText } from "./markdown/core/visible-text.mjs";

export function remarkReadingTime() {
	return (tree, { data }) => {
		const textOnPage = visibleText(tree);
		const readingTime = getReadingTime(textOnPage);
		data.astro.frontmatter.minutes = Math.max(
			1,
			Math.round(readingTime.minutes),
		);
		data.astro.frontmatter.words = readingTime.words;
	};
}
