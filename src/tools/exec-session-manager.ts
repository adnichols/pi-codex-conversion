import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";

export interface UnifiedExecResult {
	chunk_id: string;
	wall_time_seconds: number;
	output: string;
	exit_code?: number;
	session_id?: number;
	original_token_count?: number;
}

export interface ExecCommandInput {
	cmd: string;
	workdir?: string;
	shell?: string;
	tty?: boolean;
	yield_time_ms?: number;
	max_output_tokens?: number;
	login?: boolean;
}

export interface WriteStdinInput {
	session_id: number;
	chars?: string;
	yield_time_ms?: number;
	max_output_tokens?: number;
}

interface ExecSession {
	id: number;
	command: string;
	child: ChildProcessWithoutNullStreams;
	buffer: string;
	cursor: number;
	exitCode: number | null | undefined;
	listeners: Set<() => void>;
}

export interface ExecSessionManager {
	exec(input: ExecCommandInput, cwd: string): Promise<UnifiedExecResult>;
	write(input: WriteStdinInput): Promise<UnifiedExecResult>;
	hasSession(sessionId: number): boolean;
	onSessionExit(listener: (sessionId: number, command: string) => void): () => void;
	shutdown(): void;
}

const DEFAULT_YIELD_TIME_MS = 1000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4000;

function resolveWorkdir(baseCwd: string, workdir?: string): string {
	if (!workdir) return baseCwd;
	return resolve(baseCwd, workdir);
}

function resolveShell(shell?: string): string {
	return shell || process.env.SHELL || "/bin/bash";
}

function maxCharsForTokens(maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS): number {
	return Math.max(256, maxOutputTokens * 4);
}

function consumeOutput(session: ExecSession, maxOutputTokens?: number): { output: string; original_token_count?: number } {
	const text = session.buffer.slice(session.cursor);
	session.cursor = session.buffer.length;
	if (text.length === 0) {
		return { output: "" };
	}

	const maxChars = maxCharsForTokens(maxOutputTokens);
	const originalTokenCount = Math.ceil(text.length / 4);
	if (text.length <= maxChars) {
		return { output: text, original_token_count: originalTokenCount };
	}

	return {
		output: text.slice(-maxChars),
		original_token_count: originalTokenCount,
	};
}

export function createExecSessionManager(): ExecSessionManager {
	let nextSessionId = 1;
	const sessions = new Map<number, ExecSession>();
	const exitListeners = new Set<(sessionId: number, command: string) => void>();

	function notify(session: ExecSession): void {
		for (const listener of session.listeners) {
			listener();
		}
	}

	function finalizeSession(session: ExecSession): void {
		for (const listener of exitListeners) {
			listener(session.id, session.command);
		}
		notify(session);
	}

	function waitForActivity(session: ExecSession, yieldTimeMs = DEFAULT_YIELD_TIME_MS): Promise<number> {
		const startedAt = Date.now();
		return new Promise((resolvePromise) => {
			const onWake = () => {
				cleanup();
				resolvePromise(Date.now() - startedAt);
			};
			const timeout = setTimeout(onWake, yieldTimeMs);
			const cleanup = () => {
				clearTimeout(timeout);
				session.listeners.delete(onWake);
			};
			session.listeners.add(onWake);
		});
	}

	function makeResult(session: ExecSession, waitMs: number, maxOutputTokens?: number): UnifiedExecResult {
		const consumed = consumeOutput(session, maxOutputTokens);
		const result: UnifiedExecResult = {
			chunk_id: randomUUID(),
			wall_time_seconds: waitMs / 1000,
			output: consumed.output,
		};
		if (consumed.original_token_count !== undefined) {
			result.original_token_count = consumed.original_token_count;
		}
		if (session.exitCode === undefined || session.exitCode === null) {
			result.session_id = session.id;
		} else {
			result.exit_code = session.exitCode;
			if (session.cursor >= session.buffer.length) {
				sessions.delete(session.id);
			}
		}
		return result;
	}

		return {
		exec: async (input, cwd) => {
			const shell = resolveShell(input.shell);
			const workdir = resolveWorkdir(cwd, input.workdir);
			const login = input.login ?? true;
			const shellArgs = login ? ["-lc", input.cmd] : ["-c", input.cmd];
			const child = spawn(shell, shellArgs, {
				cwd: workdir,
				stdio: ["pipe", "pipe", "pipe"],
				env: process.env,
			});
			const session: ExecSession = {
				id: nextSessionId++,
				command: input.cmd,
				child,
				buffer: "",
				cursor: 0,
				exitCode: undefined,
				listeners: new Set(),
			};
			sessions.set(session.id, session);

			child.stdout.on("data", (data: Buffer) => {
				session.buffer += data.toString("utf8");
				notify(session);
			});
			child.stderr.on("data", (data: Buffer) => {
				session.buffer += data.toString("utf8");
				notify(session);
			});
			child.on("close", (code) => {
				session.exitCode = code ?? 0;
				finalizeSession(session);
			});
			child.on("error", (error) => {
				session.buffer += `${error.message}\n`;
				session.exitCode = 1;
				finalizeSession(session);
			});

			const waitedMs = await waitForActivity(session, input.yield_time_ms);
			return makeResult(session, waitedMs, input.max_output_tokens);
		},
		write: async (input) => {
			const session = sessions.get(input.session_id);
			if (!session) {
				return {
					chunk_id: randomUUID(),
					wall_time_seconds: 0,
					output: "Session not found",
					exit_code: 1,
				};
			}
			if (input.chars && session.exitCode === undefined) {
				session.child.stdin.write(input.chars);
			}
			const waitedMs = session.exitCode === undefined ? await waitForActivity(session, input.yield_time_ms) : 0;
			return makeResult(session, waitedMs, input.max_output_tokens);
		},
		hasSession: (sessionId) => sessions.has(sessionId),
		onSessionExit: (listener) => {
			exitListeners.add(listener);
			return () => exitListeners.delete(listener);
		},
		shutdown: () => {
			for (const session of sessions.values()) {
				if (session.exitCode === undefined) {
					session.child.kill("SIGTERM");
				}
			}
			sessions.clear();
		},
	};
}
