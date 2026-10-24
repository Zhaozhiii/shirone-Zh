/** Micromark constructs: literal regions are handled by the host parser first. */
function delimited(
	type,
	open,
	close,
	{ multiline = false, nested = false, compact = false } = {},
) {
	return {
		name: type,
		tokenize(effects, ok, nok) {
			const previous = this.previous;
			let opening = 0;
			let closing = 0;
			let depth = 0;
			let escaped = false;
			let length = 0;
			return start;
			function start(code) {
				if (!opening && type === "obsidianMark" && previous === 61)
					return nok(code);
				if (code !== open.charCodeAt(opening)) return nok(code);
				if (!opening) effects.enter(type);
				effects.consume(code);
				opening++;
				return opening === open.length ? inside : start;
			}
			function inside(code) {
				if (code === null || (!multiline && code < 0)) return nok(code);
				if (type === "obsidianMark" && !length && code === 61) return nok(code);
				if (code === -3 || code === -4 || code === -5) {
					effects.enter("lineEnding");
					effects.consume(code);
					effects.exit("lineEnding");
					length++;
					return inside;
				}
				if (
					compact &&
					(code === 32 ||
						code === 9 ||
						(!length && code === open.charCodeAt(0)))
				)
					return nok(code);
				if (!escaped && nested && code === 91) depth++;
				if (
					!escaped &&
					code === close.charCodeAt(closing) &&
					(!nested || !depth)
				) {
					if (!length && type !== "obsidianComment") return nok(code);
					effects.consume(code);
					closing++;
					if (closing === close.length) {
						effects.exit(type);
						return ok;
					}
					return closingPart;
				}
				if (!escaped && nested && code === 93) depth--;
				escaped = !escaped && code === 92;
				effects.consume(code);
				length++;
				return inside;
			}
			function closingPart(code) {
				if (code === close.charCodeAt(closing)) {
					effects.consume(code);
					closing++;
					if (closing === close.length) {
						effects.exit(type);
						return ok;
					}
					return closingPart;
				}
				length += closing;
				closing = 0;
				return inside(code);
			}
		},
	};
}

const specifications = [
	["obsidianWiki", "[[", "]]"],
	["obsidianEmbed", "![[", "]]"],
	["obsidianComment", "%%", "%%", { multiline: true }],
	["obsidianInlineFootnote", "^[", "]", { nested: true }],
	["obsidianSup", "^", "^", { compact: true }],
	["obsidianSub", "~", "~", { compact: true }],
	["obsidianMark", "==", "=="],
	["obsidianInlineMath", "\\(", "\\)"],
	["obsidianDisplayMath", "\\[", "\\]", { multiline: true }],
];

export function remarkObsidianSyntax() {
	const parser = this.parser;
	this.parser = (source) =>
		parser(source.endsWith("\n") ? source : `${source}\n`);
	const data = this.data();
	const text = {};
	const enter = {};
	const exit = {};
	for (const [type, open, close, options] of specifications) {
		text[open.charCodeAt(0)] ??= [];
		text[open.charCodeAt(0)].push(delimited(type, open, close, options));
		enter[type] = function (token) {
			this.enter({ type, value: "" }, token);
		};
		exit[type] = function (token) {
			this.stack.at(-1).value = this.sliceSerialize(token).slice(
				open.length,
				-close.length,
			);
			this.exit(token);
		};
	}
	data.micromarkExtensions ??= [];
	data.micromarkExtensions.push({
		text,
		flow: {
			37: {
				...delimited("obsidianComment", "%%", "%%", { multiline: true }),
				concrete: true,
			},
			92: {
				...delimited("obsidianDisplayMath", "\\[", "\\]", { multiline: true }),
				concrete: true,
			},
		},
	});
	data.fromMarkdownExtensions ??= [];
	data.fromMarkdownExtensions.push({ enter, exit });
}
