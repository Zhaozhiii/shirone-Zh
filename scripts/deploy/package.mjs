import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { releaseVersion } from "./release-version.mjs";

const head = execFileSync("git", ["rev-parse", "HEAD"], {
	encoding: "utf8",
}).trim();
// A private content workflow has a different immutable GITHUB_SHA. CODE_SHA
// explicitly identifies the theme checkout while retaining the legacy guard.
const expectedCode = process.env.CODE_SHA || process.env.GITHUB_SHA;
if (expectedCode && expectedCode !== head)
	throw new Error("Release SHA does not match the checked-out commit");
let content;
try {
	content = JSON.parse(await readFile("content.lock.json", "utf8")).source
		?.commit;
} catch (error) {
	if (error.code !== "ENOENT") throw error;
}
if (process.env.CONTENT_SHA && process.env.CONTENT_SHA !== content)
	throw new Error(
		"Materialized content does not match the resolved content commit",
	);
const release = releaseVersion(head, content);
if (process.env.RELEASE_SHA && process.env.RELEASE_SHA !== release)
	throw new Error("Release version does not match code and content commits");
const dirty = Boolean(
	execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
		encoding: "utf8",
	}).trim(),
);
if (process.env.CI && dirty)
	throw new Error("CI releases require a clean working tree");
const output = resolve("artifacts/deploy");
if (
	!output.startsWith(`${resolve("artifacts")}\\`) &&
	!output.startsWith(`${resolve("artifacts")}/`)
) {
	throw new Error("Release output must stay in artifacts/");
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp("dist", join(output, "dist"), { recursive: true });
await writeFile(
	join(output, "health.json"),
	`${JSON.stringify({ status: "ok", release, code: head, content })}\n`,
);
await writeFile(
	join(output, "release.json"),
	`${JSON.stringify({ release, code: head, content, dirty })}\n`,
);
const checksums = [];
async function visit(directory) {
	for (const item of (await readdir(directory, { withFileTypes: true })).sort(
		(a, b) => a.name.localeCompare(b.name),
	)) {
		const path = join(directory, item.name);
		if (item.isDirectory()) await visit(path);
		else if (item.isFile())
			checksums.push(
				`${createHash("sha256")
					.update(await readFile(path))
					.digest("hex")}  ${relative(output, path).replaceAll("\\", "/")}`,
			);
		else throw new Error(`Unexpected non-file release entry: ${path}`);
	}
}
await visit(output);
await writeFile(join(output, "SHA256SUMS"), `${checksums.join("\n")}\n`);
const archive = resolve("artifacts/release.tar.gz");
const archiveChecksum = `${archive}.sha256`;
// Local builds and CI produce the same complete set of release artifacts.
await rm(archive, { force: true });
await rm(archiveChecksum, { force: true });
execFileSync("tar", ["-czf", archive, "-C", output, "."], { stdio: "inherit" });
await writeFile(
	archiveChecksum,
	`${createHash("sha256")
		.update(await readFile(archive))
		.digest("hex")}  release.tar.gz\n`,
);
console.log(`Packaged ${release}: ${checksums.length} files in ${output}`);
if (dirty)
	console.log(
		"Local snapshot includes uncommitted changes; commit and rebuild before deployment.",
	);
