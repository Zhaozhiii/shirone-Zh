import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { safePath } from "./files.mjs";

const ALLOWED_ASSETS =
	/\.(png|jpe?g|webp|avif|gif|svg|bmp|pdf|mp3|mp4|ogg|webm|wav|m4a|flac|aac|opus|ogv|mov|mkv|woff2?)$/i;
const IMAGE_FIELDS = new Set([
	"cover",
	"image",
	"src",
	"imgurl",
	"avatar",
	"photo",
	"poster",
	"thumbnail",
]);

/** Build-scoped indexes and hashes; nothing persists across edits or builds. */
export function createResources({ root, sourceRoot, paths }) {
	const exact = new Set(paths);
	const suffixes = new Map();
	for (const path of paths) {
		const parts = path.split("/");
		for (let index = 0; index < parts.length; index++) {
			const suffix = parts.slice(index).join("/");
			// null represents an ambiguous name; exact paths still take precedence.
			suffixes.set(suffix, suffixes.has(suffix) ? null : path);
		}
	}
	const resolved = new Map();
	const attachments = new Map();
	// Key by destination to copy identical content only once.
	const copies = new Map();

	function resolveFile(value, notePath = "") {
		const key = JSON.stringify([notePath, value]);
		if (resolved.has(key)) return resolved.get(key);
		let name;
		try {
			name = decodeURIComponent(value.replace(/%(?![a-f\d]{2})/gi, "%25"))
				.normalize("NFC")
				.replaceAll("\\", "/")
				.replace(/^\/+/, "");
		} catch {
			throw new Error("Invalid resource path");
		}
		const local = posix.normalize(posix.join(posix.dirname(notePath), name));
		const found = exact.has(local)
			? local
			: exact.has(name)
				? name
				: (suffixes.get(name) ?? null);
		if (found) safePath(sourceRoot, found);
		resolved.set(key, found);
		return found;
	}

	function strictAsset(input, notePath = "") {
		if (typeof input !== "string" || !input) return input;
		const value = input.replace(/^!?\[\[([^\]]+)\]\]$/, "$1").split("|")[0];
		if (/^(https?:|data:|#)/i.test(value)) return value;
		if (/^[a-z][a-z0-9+.-]*:/i.test(value))
			throw new Error("Unsupported resource scheme");
		const found = resolveFile(value.split("#")[0], notePath);
		if (!found) {
			if (
				value.startsWith("/") &&
				existsSync(safePath(join(root, "site/public"), value.slice(1)))
			)
				return value;
			if (
				value.startsWith("assets/") &&
				(existsSync(safePath(join(root, "src"), value)) ||
					existsSync(safePath(join(root, "site"), value)))
			)
				return value;
			throw new Error(`A published resource is missing or ambiguous: ${value}`);
		}
		if (!ALLOWED_ASSETS.test(found))
			throw new Error("Only supported attachments may be published");
		if (!attachments.has(found)) {
			const hash = createHash("sha256")
				.update(readFileSync(safePath(sourceRoot, found)))
				.digest("hex");
			const target = `public/images/vault/${hash}${posix.extname(found).toLowerCase()}`;
			attachments.set(found, `/${target.slice("public/".length)}`);
			if (!copies.has(target)) copies.set(target, found);
		}
		return attachments.get(found);
	}
	function reference(input, notePath = "") {
		if (typeof input !== "string" || !input) return { status: "missing" };
		const value = input.replace(/^!?\[\[([^\]]+)\]\]$/, "$1").split("|")[0];
		if (/^https?:\/\//i.test(value)) return { status: "valid", url: value };
		let decoded;
		try { decoded = decodeURIComponent(value.split(/[?#]/)[0].replace(/%(?![a-f\d]{2})/gi, "%25")).replaceAll("\\", "/"); } catch { return { status: "missing" }; }
		const local = posix.normalize(posix.join(posix.dirname(notePath), decoded));
		if (/^[a-z][a-z\d+.-]*:/i.test(decoded) || decoded.startsWith("//") || local === ".." || local.startsWith("../") || decoded.includes("\0")) return { status: "outside" };
		try {
			const url = strictAsset(value.split(/[?#]/)[0], notePath);
			const suffix = value.slice(value.search(/[?#]/) < 0 ? value.length : value.search(/[?#]/));
			return { status: "valid", url: url + suffix };
		} catch {
			return { status: suffixes.has(decoded) && suffixes.get(decoded) === null ? "ambiguous" : "missing" };
		}
	}
	function asset(input, notePath = "") {
		if (typeof input !== "string" || !input) return input;
		return reference(input, notePath).url || "";
	}

	function mapAssets(value, notePath = "", field = "") {
		if (typeof value === "string")
			return IMAGE_FIELDS.has(field) || /^!?\[\[|^附件\//.test(value)
				? asset(value, notePath)
				: value;
		if (Array.isArray(value))
			return value.map((item) => mapAssets(item, notePath, field));
		if (value && typeof value === "object")
			return Object.fromEntries(
				Object.entries(value).map(([key, item]) => [
					key,
					mapAssets(item, notePath, key),
				]),
			);
		return value;
	}
	return { resolveFile, reference, asset, mapAssets, copies };
}
