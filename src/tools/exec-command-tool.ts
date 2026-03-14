import { createBashTool, type BashToolDetails, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { renderExecCommandCall } from "./codex-rendering.ts";
import type { ExecCommandTracker } from "./exec-command-state.ts";

const originalBash = createBashTool(process.cwd());

interface ExecCommandParams {
	command: string;
	timeout?: number;
}

function parseExecCommandParams(params: unknown): ExecCommandParams {
	if (!params || typeof params !== "object") {
		throw new Error("exec_command requires an object parameter");
	}

	const command = "command" in params ? params.command : undefined;
	const timeout = "timeout" in params ? params.timeout : undefined;
	if (typeof command !== "string") {
		throw new Error("exec_command requires a string 'command' parameter");
	}
	if (timeout !== undefined && typeof timeout !== "number") {
		throw new Error("exec_command 'timeout' must be a number when provided");
	}
	return { command, timeout };
}

function isBashToolDetails(details: unknown): details is BashToolDetails {
	return typeof details === "object" && details !== null;
}

export function registerExecCommandTool(pi: ExtensionAPI, tracker: ExecCommandTracker): void {
	pi.registerTool({
		name: "exec_command",
		label: "exec_command",
		description: "Runs a shell command in the current working directory and returns the output.",
		promptSnippet: "Run a shell command.",
		promptGuidelines: [
			"Use exec_command for search, listing files, and local text-file reads.",
			"Prefer rg or rg --files when possible.",
		],
		parameters: originalBash.parameters,
		async execute(toolCallId, params, signal, onUpdate) {
			return originalBash.execute(toolCallId, parseExecCommandParams(params), signal, onUpdate);
		},
		renderCall(args, theme) {
			const command = typeof args.command === "string" ? args.command : "";
			return new Text(renderExecCommandCall(command, tracker.getState(command), theme), 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial || !expanded) {
				return undefined;
			}

			const content = result.content.find((item) => item.type === "text");
			const output = content?.type === "text" ? content.text : "";
			const details = isBashToolDetails(result.details) ? result.details : undefined;

			let text = theme.fg("dim", output || "(no output)");
			if (details?.truncation?.truncated && details.fullOutputPath) {
				text += `\n${theme.fg("warning", `Full output: ${details.fullOutputPath}`)}`;
			}
			return new Text(text, 0, 0);
		},
	});
}
