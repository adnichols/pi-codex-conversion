import test from "node:test";
import assert from "node:assert/strict";
import { renderWebSearchActivity } from "../src/tools/codex-rendering.ts";

const theme = {
	fg(_role: string, text: string) {
		return text;
	},
	bold(text: string) {
		return text;
	},
};

test("renderWebSearchActivity matches codex-like tool activity text", () => {
	assert.equal(renderWebSearchActivity(1, theme), "• Searched the web");
});

test("renderWebSearchActivity shows count only when expanded", () => {
	assert.equal(renderWebSearchActivity(2, theme, false), "• Searched the web");
	assert.equal(renderWebSearchActivity(2, theme, true), "• Searched the web\n  └ 2 web searches in this turn");
});
