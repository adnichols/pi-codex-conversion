import test from "node:test";
import assert from "node:assert/strict";
import { isCodexLikeModel } from "../src/adapter/codex-model.ts";

test("detects codex provider and model ids", () => {
	assert.equal(isCodexLikeModel({ provider: "openai-codex", api: "responses", id: "codex-mini-latest" }), true);
	assert.equal(isCodexLikeModel({ provider: "OpenAI", api: "responses", id: "gpt-5" }), true);
});

test("avoids false positives for non-openai non-codex models", () => {
	assert.equal(isCodexLikeModel({ provider: "anthropic", api: "messages", id: "claude-sonnet-4" }), false);
	assert.equal(isCodexLikeModel(undefined), false);
});
