import { createHash } from "node:crypto";

export function requireSha(value, label) {
	if (!/^[a-f0-9]{40}$/.test(value || ""))
		throw new Error(`${label} must be a full Git commit SHA`);
	return value;
}

/** Keep the server's 40-character release contract while versioning both repos. */
export function releaseVersion(code, content) {
	requireSha(code, "Code version");
	if (!content) return code;
	requireSha(content, "Content version");
	return createHash("sha1")
		.update(`shirone-release-v1\n${code}\n${content}\n`)
		.digest("hex");
}

export function isCurrentRelease({
	code,
	content,
	latestCode,
	latestContent,
	allowRollback = false,
}) {
	return code === latestCode && (allowRollback || content === latestContent);
}
