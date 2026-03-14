import test from "node:test";
import assert from "node:assert/strict";
import { renderExecCommandCall, renderWriteStdinCall, type RenderTheme } from "../src/tools/codex-rendering.ts";

const theme: RenderTheme = {
	fg: (_role, text) => text,
	bold: (text) => text,
};

test("renderExecCommandCall uses codex-style running and ran labels", () => {
	assert.equal(renderExecCommandCall("npm test", "running", theme), "• Running\n  └ npm test");
	assert.equal(renderExecCommandCall("npm test", "done", theme), "• Ran\n  └ npm test");
});

test("renderWriteStdinCall renders interactions as background terminal input", () => {
	assert.equal(
		renderWriteStdinCall(7, "hello\n", "cargo test -p codex-core", theme),
		"↳ Interacted with background terminal · cargo test -p codex-core",
	);
});

test("renderWriteStdinCall renders empty polls as waiting for background terminal", () => {
	assert.equal(
		renderWriteStdinCall(7, "", "cargo test -p codex-core", theme),
		"• Waited for background terminal · cargo test -p codex-core",
	);
});

test("renderWriteStdinCall falls back to session id when command display is unavailable", () => {
	assert.equal(renderWriteStdinCall(7, "", undefined, theme), "• Waited for background terminal #7");
});
