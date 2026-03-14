import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import type { ExecSessionManager, UnifiedExecResult } from "./exec-session-manager.ts";
import { formatUnifiedExecResult } from "./unified-exec-format.ts";

const WRITE_STDIN_PARAMETERS = Type.Object({
	session_id: Type.Number({ description: "Identifier of the running unified exec session." }),
	chars: Type.Optional(Type.String({ description: "Bytes to write to stdin. May be empty to poll." })),
	yield_time_ms: Type.Optional(Type.Number({ description: "How long to wait (in milliseconds) for output before yielding." })),
	max_output_tokens: Type.Optional(Type.Number({ description: "Maximum number of tokens to return. Excess output will be truncated." })),
});

interface WriteStdinParams {
	session_id: number;
	chars?: string;
	yield_time_ms?: number;
	max_output_tokens?: number;
}

function parseWriteStdinParams(params: unknown): WriteStdinParams {
	if (!params || typeof params !== "object" || !("session_id" in params) || typeof params.session_id !== "number") {
		throw new Error("write_stdin requires numeric 'session_id'");
	}
	const chars = "chars" in params && typeof params.chars === "string" ? params.chars : undefined;
	const yield_time_ms = "yield_time_ms" in params && typeof params.yield_time_ms === "number" ? params.yield_time_ms : undefined;
	const max_output_tokens =
		"max_output_tokens" in params && typeof params.max_output_tokens === "number" ? params.max_output_tokens : undefined;
	return { session_id: params.session_id, chars, yield_time_ms, max_output_tokens };
}

function isUnifiedExecResult(details: unknown): details is UnifiedExecResult {
	return typeof details === "object" && details !== null;
}

export function registerWriteStdinTool(pi: ExtensionAPI, sessions: ExecSessionManager): void {
	pi.registerTool({
		name: "write_stdin",
		label: "write_stdin",
		description: "Writes characters to an existing unified exec session and returns recent output.",
		promptSnippet: "Write to an exec session.",
		parameters: WRITE_STDIN_PARAMETERS,
		async execute(_toolCallId, params) {
			const typed = parseWriteStdinParams(params);
			const command = sessions.getSessionCommand(typed.session_id);
			let result: UnifiedExecResult;
			try {
				result = await sessions.write(typed);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`write_stdin failed: ${message}`);
			}
			return {
				content: [{ type: "text", text: formatUnifiedExecResult(result, command) }],
				details: result,
			};
		},
		renderCall(args, theme) {
			const sessionId = typeof args.session_id === "number" ? args.session_id : "?";
			return new Text(`${theme.fg("toolTitle", theme.bold("write_stdin"))} ${theme.fg("accent", String(sessionId))}`, 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial || !expanded) return undefined;
			const details = isUnifiedExecResult(result.details) ? result.details : undefined;
			const output = details?.output ?? "(no output)";
			let text = theme.fg("dim", output || "(no output)");
			if (details?.session_id !== undefined) {
				text += `\n${theme.fg("accent", `Session ${details.session_id} still running`)}`;
			}
			if (details?.exit_code !== undefined) {
				text += `\n${theme.fg("muted", `Exit code: ${details.exit_code}`)}`;
			}
			return new Text(text, 0, 0);
		},
	});
}
