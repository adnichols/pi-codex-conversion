import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { ADAPTER_TOOL_NAMES, DEFAULT_TOOL_NAMES, STATUS_KEY, STATUS_TEXT } from "./adapter/tool-set.ts";
import { registerApplyPatchTool } from "./tools/apply-patch-tool.ts";
import { isCodexLikeContext } from "./adapter/codex-model.ts";
import { createExecCommandTracker } from "./tools/exec-command-state.ts";
import { registerExecCommandTool } from "./tools/exec-command-tool.ts";
import { buildCodexSystemPrompt } from "./prompt/build-system-prompt.ts";
import { registerViewImageTool } from "./tools/view-image-tool.ts";

interface AdapterState {
	enabled: boolean;
	previousToolNames?: string[];
}

function getCommandArg(args: unknown): string | undefined {
	if (!args || typeof args !== "object" || !("command" in args) || typeof args.command !== "string") {
		return undefined;
	}
	return args.command;
}

export default function codexConversion(pi: ExtensionAPI) {
	const tracker = createExecCommandTracker();
	const state: AdapterState = { enabled: false };

	registerApplyPatchTool(pi);
	registerExecCommandTool(pi, tracker);
	registerViewImageTool(pi);

	pi.on("session_start", async (_event, ctx) => {
		syncAdapter(pi, ctx, state);
	});

	pi.on("model_select", async (_event, ctx) => {
		syncAdapter(pi, ctx, state);
	});

	pi.on("tool_execution_start", async (event) => {
		if (event.toolName !== "exec_command") return;
		const command = getCommandArg(event.args);
		if (!command) return;
		tracker.recordStart(event.toolCallId, command);
	});

	pi.on("tool_execution_end", async (event) => {
		if (event.toolName !== "exec_command") return;
		tracker.recordEnd(event.toolCallId);
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		if (!isCodexLikeContext(ctx)) {
			return undefined;
		}
		return { systemPrompt: buildCodexSystemPrompt(ctx.cwd) };
	});
}

function syncAdapter(pi: ExtensionAPI, ctx: ExtensionContext, state: AdapterState): void {
	if (isCodexLikeContext(ctx)) {
		enableAdapter(pi, ctx, state);
	} else {
		disableAdapter(pi, ctx, state);
	}
}

function enableAdapter(pi: ExtensionAPI, ctx: ExtensionContext, state: AdapterState): void {
	if (!state.enabled) {
		// Preserve the previous active set once so switching away from Codex-like
		// models restores the user's existing Pi tool configuration.
		state.previousToolNames = pi.getActiveTools();
		pi.setActiveTools(ADAPTER_TOOL_NAMES);
		state.enabled = true;
	}
	setStatus(ctx, true);
}

function disableAdapter(pi: ExtensionAPI, ctx: ExtensionContext, state: AdapterState): void {
	if (state.enabled) {
		pi.setActiveTools(state.previousToolNames && state.previousToolNames.length > 0 ? state.previousToolNames : DEFAULT_TOOL_NAMES);
		state.enabled = false;
	}
	setStatus(ctx, false);
}

function setStatus(ctx: ExtensionContext, enabled: boolean): void {
	if (!ctx.hasUI) return;
	ctx.ui.setStatus(STATUS_KEY, enabled ? STATUS_TEXT : undefined);
}
