import test from "node:test";
import assert from "node:assert/strict";
import { buildCodexSystemPrompt } from "../src/prompt/build-system-prompt.ts";

test("buildCodexSystemPrompt injects date and cwd into compact prompt", () => {
	const prompt = buildCodexSystemPrompt("/tmp/example-workspace");
	assert.match(prompt, /^You are Codex\./);
	assert.match(prompt, /Current date: \d{4}-\d{2}-\d{2}/);
	assert.match(prompt, /Current working directory: \/tmp\/example-workspace/);
	assert.doesNotMatch(prompt, /Codex-compatible tool adapter/);
	assert.doesNotMatch(prompt, /\/home\/igorw\/.+pi-coding-agent/);
	assert.doesNotMatch(prompt, /^- `write`/m);
	assert.match(prompt, /^- `apply_patch` — edit files by applying a patch\.$/m);
});
