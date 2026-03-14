import test from "node:test";
import assert from "node:assert/strict";
import { ADAPTER_TOOL_NAMES } from "../src/adapter/tool-set.ts";

test("adapter tool set matches codex-like surface and excludes write", () => {
	assert.deepEqual(ADAPTER_TOOL_NAMES, ["exec_command", "apply_patch", "view_image"]);
	assert.equal(ADAPTER_TOOL_NAMES.includes("write"), false);
	assert.equal(ADAPTER_TOOL_NAMES.includes("edit"), false);
	assert.equal(ADAPTER_TOOL_NAMES.includes("read"), false);
});
