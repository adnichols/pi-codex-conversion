import test from "node:test";
import assert from "node:assert/strict";
import { mergeAdapterTools, restoreTools } from "../src/index.ts";
import { getManagedAdapterToolNames } from "../src/adapter/tool-set.ts";

test("mergeAdapterTools replaces Pi core tools but preserves unrelated active tools", () => {
	assert.deepEqual(
		mergeAdapterTools(["read", "bash", "edit", "write", "parallel", "custom_search"], ["exec_command", "write_stdin", "apply_patch"]),
		["exec_command", "write_stdin", "apply_patch", "parallel", "custom_search"],
	);
});

test("restoreTools restores previous tools and keeps custom tools added while adapter mode was enabled", () => {
	assert.deepEqual(
		restoreTools(["read", "bash", "edit", "write", "parallel"], ["exec_command", "write_stdin", "apply_patch", "parallel", "custom_search"]),
		["read", "bash", "edit", "write", "parallel", "custom_search"],
	);
});

test("restoreTools strips adapter tools from mixed startup state while keeping unrelated tools", () => {
	assert.deepEqual(
		restoreTools(["read", "bash", "edit", "write"], ["read", "bash", "edit", "write", "apply_patch", "exec_command", "write_stdin", "web_search", "parallel"]),
		["read", "bash", "edit", "write", "parallel"],
	);
});

test("mergeAdapterTools preserves existing non-codex web_search when codex web search is disabled", () => {
	assert.deepEqual(
		mergeAdapterTools(
			["read", "bash", "edit", "write", "web_search", "parallel"],
			["exec_command", "write_stdin", "apply_patch"],
			getManagedAdapterToolNames(false),
		),
		["exec_command", "write_stdin", "apply_patch", "web_search", "parallel"],
	);
});
