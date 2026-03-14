import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executePatch } from "../apply-patch-core.ts";

test("executePatch updates, adds, and moves files inside cwd", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-codex-conversion-"));
	try {
		writeFileSync(join(cwd, "alpha.txt"), "old line\nkeep line\n", "utf8");
		const result = executePatch({
			cwd,
			patchText: `*** Begin Patch
*** Update File: alpha.txt
*** Move to: moved/alpha.txt
@@
-old line
+new line
 keep line
*** Add File: beta.txt
+hello beta
*** End Patch`,
		});

		assert.deepEqual(result.changedFiles.sort(), ["alpha.txt", "beta.txt", "moved/alpha.txt"].sort());
		assert.deepEqual(result.createdFiles.sort(), ["beta.txt", "moved/alpha.txt"].sort());
		assert.deepEqual(result.deletedFiles, ["alpha.txt"]);
		assert.deepEqual(result.movedFiles, ["alpha.txt -> moved/alpha.txt"]);
		assert.equal(readFileSync(join(cwd, "moved/alpha.txt"), "utf8"), "new line\nkeep line\n");
		assert.equal(readFileSync(join(cwd, "beta.txt"), "utf8"), "hello beta");
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("executePatch rejects paths that escape cwd", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-codex-conversion-"));
	try {
		assert.throws(
			() =>
				executePatch({
					cwd,
					patchText: `*** Begin Patch
*** Add File: ../escape.txt
+nope
*** End Patch`,
				}),
			/path escapes working directory/i,
		);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});
