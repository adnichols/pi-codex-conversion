import test from "node:test";
import assert from "node:assert/strict";
import { summarizeShellCommand } from "../src/shell/summary.ts";

test("classifies simple file reads as explored reads", () => {
	const summary = summarizeShellCommand("cat README.md");
	assert.equal(summary.maskAsExplored, true);
	assert.deepEqual(summary.actions, [{ kind: "read", command: "cat README.md", name: "README.md", path: "README.md" }]);
});

test("tracks cd prefixes for subsequent read commands", () => {
	const summary = summarizeShellCommand("cd src && sed -n '1,20p' index.ts");
	assert.equal(summary.maskAsExplored, true);
	assert.deepEqual(summary.actions, [{ kind: "read", command: "sed -n 1,20p index.ts", name: "index.ts", path: "src/index.ts" }]);
});

test("classifies ripgrep searches separately from command runs", () => {
	const search = summarizeShellCommand("rg -n adapter pi-codex-conversion");
	assert.equal(search.maskAsExplored, true);
	assert.deepEqual(search.actions, [{ kind: "search", command: "rg -n adapter pi-codex-conversion", query: "adapter", path: "pi-codex-conversion" }]);

	const run = summarizeShellCommand("npm test");
	assert.equal(run.maskAsExplored, false);
	assert.deepEqual(run.actions, [{ kind: "run", command: "npm test" }]);
});
