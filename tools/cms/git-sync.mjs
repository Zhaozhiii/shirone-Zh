import { refreshState } from "./core.mjs";

// Only the derived publication clock can be regenerated during a rebase.
// Authored file conflicts remain unresolved so the caller can abort safely.
export async function rebaseWithClock(git, root) {
	try {
		await git(["rebase", "origin/main"]);
		return;
	} catch (original) {
		for (let attempt = 0; attempt < 20; attempt++) {
			const conflicts = (await git(["diff", "--name-only", "--diff-filter=U"]))
				.split("\n")
				.filter(Boolean);
			if (
				conflicts.length !== 1 ||
				conflicts[0] !== "cms/publication-state.json"
			)
				throw original;
			refreshState(root);
			await git(["add", "--", "cms/publication-state.json"]);
			try {
				await git(["-c", "core.editor=true", "rebase", "--continue"]);
				return;
			} catch {
				/* Another replayed commit may also contain the old clock. */
			}
		}
		throw original;
	}
}
