import { fromHtml } from "hast-util-from-html";
import { toString as mdastText } from "mdast-util-to-string";
import {
	clone,
	element,
	safeReference,
	splitTarget,
	text,
	walk,
} from "./obsidian.mjs";

/** Contextual expansion shared by publication validation and the renderer. */
export function expandReferences(
	tree,
	{
		index,
		current = "",
		labels = {},
		target = "web",
		vault = false,
		maxDepth = 16,
		maxEmbeds = 200,
	} = {},
) {
	const diagnostics = [];
	const directLinks = new Set();
	let embeds = 0;
	let namespaceCounter = 0;
	const scopeIds = new Map();
	const occupied = new Set();
	walk(tree, (node) => {
		if (node.data?.hProperties?.id) occupied.add(node.data.hProperties.id);
	});
	let notices = 0;
	const statusText = (status, embed) =>
		labels[embed ? `embed_${status}` : status] || status;
	function diagnose(status, node) {
		const record = {
			code: status,
			source: current,
			line: node.position?.start.line,
			column: node.position?.start.column,
		};
		if (
			!diagnostics.some(
				(item) => JSON.stringify(item) === JSON.stringify(record),
			)
		)
			diagnostics.push(record);
	}
	function unavailable(status, label, embed, node, url) {
		diagnose(status, node);
		const message = statusText(status, embed);
		if (embed)
			return element(
				"aside",
				[
					text(message),
					...(url
						? [
								text(" "),
								{ type: "link", url, children: [text(labels.open || "open")] },
							]
						: []),
				],
				{
					className: ["obsidian-reference-notice"],
					"data-reference-status": status,
				},
			);
		if (target === "feed") return text(`${label} (${message})`);
		const id = `md-reference-${++notices}`;
		return element(
			"span",
			[
				element("button", [text(label)], {
					type: "button",
					popoverTarget: id,
					className: ["obsidian-unavailable-link"],
					"aria-label": `${label} (${message})`,
				}),
				element("span", [text(message)], {
					id,
					popover: "auto",
					className: ["obsidian-reference-popover"],
					role: "status",
				}),
			],
			{ className: ["obsidian-reference"], "data-reference-status": status },
		);
	}
	function asset(value, origin, node) {
		if (
			/^https?:\/\//i.test(value) ||
			value.startsWith("/images/") ||
			value.startsWith("/assets/")
		)
			return { status: "valid", url: value };
		const safe = safeReference(value.split("#")[0].split("?")[0]);
		if (safe.status !== "valid") return safe;
		try {
			return index.resolveAsset?.(value, origin) || { status: "missing" };
		} catch {
			diagnose("missing", node);
			return { status: "missing" };
		}
	}
	function media(url, label, node) {
		const extension = url.split(/[?#]/)[0].split(".").at(-1).toLowerCase();
		const dimensions = label.match(/^(\d+)(?:x(\d+))?$/);
		if (
			["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp"].includes(
				extension,
			)
		)
			return {
				type: "image",
				url,
				alt: dimensions ? "" : label,
				data: {
					hProperties: dimensions
						? {
								"data-obsidian-size": true,
								width: Number(dimensions[1]),
								...(dimensions[2] ? { height: Number(dimensions[2]) } : {}),
							}
						: {},
				},
			};
		const link = {
			type: "link",
			url,
			children: [text(label || labels.open || "open")],
		};
		if (
			[
				"mp3",
				"wav",
				"ogg",
				"m4a",
				"flac",
				"aac",
				"opus",
				"mp4",
				"webm",
				"ogv",
				"mov",
				"mkv",
			].includes(extension)
		)
			return element(
				["mp4", "webm", "ogv", "mov", "mkv"].includes(extension)
					? "video"
					: "audio",
				[link],
				{
					src: url,
					controls: true,
					preload: "metadata",
					className: ["obsidian-media"],
				},
			);
		if (extension === "pdf") {
			const params = new URLSearchParams(url.split("#")[1]);
			const height = Math.min(
				2000,
				Math.max(100, Number(params.get("height")) || 600),
			);
			return element("object", [link], {
				data: url,
				type: "application/pdf",
				height,
				title: label || labels.open || "open",
				className: ["obsidian-media"],
			});
		}
		return unavailable("missing", label, true, node);
	}
	function markdownMedia(node, url) {
		if (
			!/\.(?:pdf|mp3|wav|ogg|m4a|flac|aac|opus|mp4|webm|ogv|mov|mkv)(?:[?#]|$)/i.test(
				url,
			)
		) {
			const dimensions = (node.alt || "").match(/^(\d+)(?:x(\d+))?$/);
			return {
				...node,
				url,
				alt: dimensions ? "" : node.alt,
				data: {
					...node.data,
					hProperties: {
						...node.data?.hProperties,
						...(dimensions
							? {
									"data-obsidian-size": true,
									width: Number(dimensions[1]),
									...(dimensions[2] ? { height: Number(dimensions[2]) } : {}),
								}
							: {}),
					},
				},
			};
		}
		const replacement = media(url, node.alt || "", node);
		return replacement.type === "image"
			? {
					...node,
					...replacement,
					title: node.title,
					data: {
						...node.data,
						hProperties: {
							...node.data?.hProperties,
							...replacement.data?.hProperties,
						},
					},
				}
			: replacement;
	}
	function process(parent, origin, stack, namespace = "") {
		if (
			!parent.children ||
			["code", "inlineCode", "math", "inlineMath", "html"].includes(parent.type)
		)
			return;
		const result = [];
		for (let node of parent.children) {
			if (namespace && node.type === "html")
				node.value = node.value
					.replace(
						/\bid=(["'])(.*?)\1/gi,
						(_, quote, id) => `id=${quote}${namespace}${id}${quote}`,
					)
					.replace(
						/\bhref=(["'])#(.*?)\1/gi,
						(_, quote, id) =>
							`href=${quote}#${scopeIds.get(namespace)?.has(id) ? namespace : ""}${id}${quote}`,
					);
			if (vault && node.name === "code-tree" && node.attributes?.dir)
				node = unavailable("outside", "", true, node);
			if (
				node.type === "html" &&
				/\b(?:src|poster|data)\s*=/i.test(node.value)
			) {
				let failure;
				const value = node.value.replace(
					/\b(src|poster|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
					(_original, attribute, double, single, bare) => {
						const raw = double ?? single ?? bare;
						const value = fromHtml(
							`<img ${attribute}="${raw.replaceAll('"', "&quot;")}">`,
							{ fragment: true },
						).children[0].properties[attribute.toLowerCase()];
						const resolved = asset(value, origin, node);
						if (resolved.status !== "valid") {
							failure = resolved.status;
							return "";
						}
						return `${attribute}="${resolved.url.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`;
					},
				);
				node = failure
					? unavailable(failure, "", true, node)
					: { ...node, value };
			}
			if (["obsidianWiki", "obsidianEmbed"].includes(node.type)) {
				const embed = node.type === "obsidianEmbed";
				const parts = splitTarget(node.value);
				const label = parts.label || parts.name || parts.fragment;
				const attachment =
					/\.[a-z\d]{2,5}$/i.test(parts.name) && !/\.mdx?$/i.test(parts.name);
				if (attachment) {
					const resolved = asset(
						parts.name + (parts.fragment ? `#${parts.fragment}` : ""),
						origin,
						node,
					);
					node =
						resolved.status === "valid"
							? embed
								? media(resolved.url, parts.label, node)
								: { type: "link", url: resolved.url, children: [text(label)] }
							: unavailable(resolved.status, label, embed, node);
				} else {
					const resolved = index.resolve(node.value, origin);
					if (resolved.status !== "valid")
						node = unavailable(
							resolved.status,
							label,
							embed,
							node,
							resolved.status === "protected" ? resolved.url : undefined,
						);
					else {
						if (origin === current) directLinks.add(resolved.note.path);
						if (!embed)
							node = {
								type: "link",
								url:
									namespace &&
									resolved.note.path === origin &&
									resolved.id &&
									scopeIds.get(namespace)?.has(resolved.id)
										? `#${namespace}${resolved.id}`
										: resolved.url,
								children: [text(label)],
							};
						else if (resolved.note.encrypted)
							node = unavailable(
								"protected",
								label,
								true,
								node,
								resolved.note.url,
							);
						else {
							const key = `${resolved.note.path}#${resolved.fragment}`;
							if (stack.includes(key))
								node = unavailable("cycle", label, true, node, resolved.url);
							else if (stack.length > maxDepth || embeds >= maxEmbeds)
								node = unavailable("limit", label, true, node, resolved.url);
							else {
								embeds++;
								let prefix;
								do {
									prefix = `embed-${++namespaceCounter}-`;
								} while ([...occupied].some((id) => id.startsWith(prefix)));
								const nodes = clone(resolved.nodes);
								const ids = new Set();
								walk({ children: nodes }, (child) => {
									if (child.data?.hProperties?.id)
										ids.add(child.data.hProperties.id);
									if (child.attributes?.id) ids.add(child.attributes.id);
									if (child.type === "html")
										for (const match of child.value.matchAll(
											/\bid=["']([^"']+)["']/gi,
										))
											ids.add(match[1]);
								});
								scopeIds.set(prefix, ids);
								const references = new Set();
								walk({ children: nodes }, (child) => {
									if (child.type === "footnoteReference")
										references.add(child.identifier);
								});
								const available = new Set(
									nodes
										.filter((child) => child.type === "footnoteDefinition")
										.map((child) => child.identifier),
								);
								for (const definition of resolved.note.tree.children.filter(
									(child) =>
										child.type === "footnoteDefinition" &&
										references.has(child.identifier) &&
										!available.has(child.identifier),
								))
									nodes.push(clone(definition));
								walk({ children: nodes }, (child) => {
									if (child.data?.hProperties?.id)
										child.data.hProperties.id =
											prefix + child.data.hProperties.id;
									if (child.attributes?.id)
										child.attributes.id = prefix + child.attributes.id;
									if (
										["footnoteReference", "footnoteDefinition"].includes(
											child.type,
										)
									)
										child.identifier = prefix + child.identifier;
									if (child.type === "definition")
										child.identifier = prefix + child.identifier;
									if (["linkReference", "imageReference"].includes(child.type))
										child.identifier = prefix + child.identifier;
								});
								node = element("section", nodes, {
									className: ["obsidian-embed"],
									"data-embed-source": resolved.note.url,
								});
								process(node, resolved.note.path, [...stack, key], prefix);
								result.push(node);
								continue;
							}
						}
					}
				}
			} else if (
				["link", "image", "definition"].includes(node.type) &&
				node.url &&
				!node.data?.obsidianTag
			) {
				const isImage = node.type === "image";
				if (/^(?:https?:|mailto:|tel:|obsidian:)/i.test(node.url)) {
					if (isImage) node = markdownMedia(node, node.url);
				} else if (
					isImage &&
					/^\d+(?:x\d+)?$/.test(node.alt || "") &&
					/^(?:\/images\/|\/assets\/)/.test(node.url)
				) {
					node = markdownMedia(node, node.url);
				} else if (!/^(?:\/images\/|\/assets\/)/.test(node.url)) {
					const resolved = index.resolve(node.url, origin, false);
					if (resolved.status === "valid") {
						if (origin === current) directLinks.add(resolved.note.path);
						node.url =
							namespace &&
							resolved.note.path === origin &&
							resolved.id &&
							scopeIds.get(namespace)?.has(resolved.id)
								? `#${namespace}${resolved.id}`
								: resolved.url;
					} else if (
						resolved.status === "unpublished" ||
						resolved.status === "outside" ||
						/\.md(?:x)?(?:#|$)/i.test(node.url) ||
						node.url.startsWith("#")
					)
						node = unavailable(
							resolved.status,
							mdastText(node) || node.url,
							isImage,
							node,
						);
					else {
						const resolvedAsset = asset(node.url, origin, node);
						if (resolvedAsset.status === "valid") {
							if (isImage) node = markdownMedia(node, resolvedAsset.url);
							else node.url = resolvedAsset.url;
						} else if (!(node.url.startsWith("/") && !isImage))
							node = unavailable(
								resolvedAsset.status,
								mdastText(node) || node.url,
								isImage,
								node,
							);
					}
				}
			}
			process(node, origin, stack, namespace);
			if (
				node.type === "paragraph" &&
				node.children.some(
					(child) =>
						child.type === "obsidianElement" &&
						["section", "aside", "audio", "video", "object"].includes(
							child.data.hName,
						),
				)
			) {
				let inline = [];
				const flush = () => {
					if (
						inline.some((child) => child.type !== "text" || child.value.trim())
					)
						result.push({ ...node, children: inline });
					inline = [];
				};
				for (const child of node.children) {
					if (
						child.type === "obsidianElement" &&
						["section", "aside", "audio", "video", "object"].includes(
							child.data.hName,
						)
					) {
						flush();
						result.push(child);
					} else inline.push(child);
				}
				flush();
			} else result.push(node);
		}
		parent.children = result;
	}
	process(tree, current, [`${current}#`]);
	return { tree, diagnostics, directLinks: [...directLinks] };
}
