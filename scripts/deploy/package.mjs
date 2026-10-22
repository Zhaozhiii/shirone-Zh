import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { build } from "esbuild";

const release =
	process.env.GITHUB_SHA ||
	execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/.test(release))
	throw new Error("Expected a full Git commit SHA");
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
await build({
	entryPoints: ["scripts/deploy/start.mjs"],
	outfile: join(output, "server.cjs"),
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node22",
	legalComments: "inline",
});
await writeFile(
	join(output, "release.json"),
	`${JSON.stringify({ release })}\n`,
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
console.log(`Packaged ${release}: ${checksums.length} files in ${output}`);
