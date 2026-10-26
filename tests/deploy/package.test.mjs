import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("release archive contains verified static health metadata without a Node runtime", () => {
	const temporary = mkdtempSync(join(tmpdir(), "shirone-static-package-"));
	try {
		mkdirSync(join(temporary, "scripts/deploy"), { recursive: true });
		mkdirSync(join(temporary, "dist"));
		for (const filename of ["package.mjs", "release-version.mjs"])
			cpSync(
				fileURLToPath(
					new URL(`../../scripts/deploy/${filename}`, import.meta.url),
				),
				join(temporary, "scripts/deploy", filename),
			);
		writeFileSync(join(temporary, "dist/index.html"), "<h1>Home</h1>");
		writeFileSync(join(temporary, ".gitignore"), "artifacts/\n");
		const content = "c".repeat(40);
		writeFileSync(
			join(temporary, "content.lock.json"),
			JSON.stringify({ source: { commit: content } }),
		);
		const git = (args) =>
			execFileSync("git", args, {
				cwd: temporary,
				encoding: "utf8",
				stdio: "pipe",
			}).trim();
		git(["init"]);
		git(["add", ".gitignore", "scripts", "dist", "content.lock.json"]);
		git([
			"-c",
			"user.name=Package test",
			"-c",
			"user.email=test@example.invalid",
			"commit",
			"-m",
			"test fixture",
		]);
		const code = git(["rev-parse", "HEAD"]);
		execFileSync(process.execPath, ["scripts/deploy/package.mjs"], {
			cwd: temporary,
			env: {
				...process.env,
				CI: "true",
				CODE_SHA: code,
				CONTENT_SHA: content,
				RELEASE_SHA: "",
			},
			stdio: "pipe",
		});
		const output = join(temporary, "artifacts/deploy");
		const health = JSON.parse(
			readFileSync(join(output, "health.json"), "utf8"),
		);
		const metadata = JSON.parse(
			readFileSync(join(output, "release.json"), "utf8"),
		);
		assert.deepEqual(health, {
			status: "ok",
			release: metadata.release,
			code,
			content,
		});
		assert.equal(metadata.dirty, false);
		const checksums = readFileSync(join(output, "SHA256SUMS"), "utf8");
		assert.ok(
			checksums.includes(
				`${createHash("sha256")
					.update(readFileSync(join(output, "health.json")))
					.digest("hex")}  health.json`,
			),
		);
		const entries = execFileSync(
			"tar",
			["-tzf", join(temporary, "artifacts/release.tar.gz")],
			{ encoding: "utf8" },
		);
		assert.match(entries, /health\.json/);
		assert.doesNotMatch(entries, /server\.cjs|node_modules/);
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
});
