import test from "node:test";
import assert from "node:assert/strict";
import { payloadContainsWebSearchTool, rewriteNativeWebSearchTool, supportsNativeWebSearch } from "../src/tools/web-search-tool.ts";

test("supportsNativeWebSearch only enables the tool for openai-codex", () => {
	assert.equal(supportsNativeWebSearch({ provider: "openai-codex", api: "openai-codex-responses", id: "gpt-5.4" } as never), true);
	assert.equal(supportsNativeWebSearch({ provider: "openai", api: "openai-responses", id: "gpt-5" } as never), false);
	assert.equal(supportsNativeWebSearch({ provider: "github-copilot", api: "chat-completions", id: "gpt-5.4" } as never), false);
});

test("rewriteNativeWebSearchTool replaces the adapter function tool with the native openai-codex tool", () => {
	const payload = {
		model: "gpt-5.4",
		tools: [
			{ type: "function", name: "exec_command", parameters: { type: "object" } },
			{ type: "function", name: "web_search", parameters: { type: "object" } },
		],
	};

	assert.deepEqual(
		rewriteNativeWebSearchTool(payload, { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-5.4" } as never),
		{
			model: "gpt-5.4",
			tools: [
				{ type: "function", name: "exec_command", parameters: { type: "object" } },
				{ type: "web_search", external_web_access: true },
			],
		},
	);
});

test("rewriteNativeWebSearchTool leaves other providers untouched", () => {
	const payload = {
		model: "gpt-5",
		tools: [{ type: "function", name: "web_search", parameters: { type: "object" } }],
	};

	assert.equal(
		rewriteNativeWebSearchTool(payload, { provider: "openai", api: "openai-responses", id: "gpt-5" } as never),
		payload,
	);
});

test("payloadContainsWebSearchTool detects both adapter and rewritten native tools", () => {
	assert.equal(payloadContainsWebSearchTool({ tools: [{ type: "function", name: "web_search", parameters: { type: "object" } }] }), true);
	assert.equal(payloadContainsWebSearchTool({ tools: [{ type: "web_search", external_web_access: true }] }), true);
	assert.equal(payloadContainsWebSearchTool({ tools: [{ type: "function", name: "exec_command", parameters: { type: "object" } }] }), false);
});
