import test from "node:test";
import assert from "node:assert/strict";
import { createExecSessionManager, type UnifiedExecResult } from "../src/tools/exec-session-manager.ts";

async function finishSession(
	sessionId: number,
	write: (chars?: string) => Promise<UnifiedExecResult>,
): Promise<{ output: string; final: UnifiedExecResult }> {
	let result = await write("hello\n");
	let output = result.output;
	for (let attempt = 0; attempt < 5 && result.session_id !== undefined; attempt++) {
		result = await write();
		output += result.output;
	}
	return { output, final: result };
}

test("exec session manager supports long-running commands via write_stdin", async () => {
	const sessions = createExecSessionManager();
	try {
		const started = await sessions.exec(
			{
				cmd: "printf ready && read line && printf ':%s' \"$line\"",
				shell: "/bin/bash",
				login: false,
				tty: true,
				yield_time_ms: 50,
			},
			process.cwd(),
		);

		assert.equal(started.output, "ready");
		assert.equal(typeof started.session_id, "number");
		assert.equal(started.exit_code, undefined);

		const resumed = await finishSession(started.session_id!, (chars) =>
			sessions.write({
				session_id: started.session_id!,
				chars,
				yield_time_ms: 50,
			}),
		);

		assert.equal(resumed.output, "hello\n:hello");
		assert.equal(resumed.final.session_id, undefined);
		assert.equal(resumed.final.exit_code, 0);
	} finally {
		sessions.shutdown();
	}
});

test("write_stdin rejects interactive input for non-tty sessions", async () => {
	const sessions = createExecSessionManager();
	try {
		const started = await sessions.exec(
			{
				cmd: "sleep 5",
				shell: "/bin/bash",
				login: false,
				yield_time_ms: 50,
			},
			process.cwd(),
		);

		assert.equal(typeof started.session_id, "number");
		await assert.rejects(
			() =>
				sessions.write({
					session_id: started.session_id!,
					chars: "hello\n",
					yield_time_ms: 50,
				}),
			/stdin is closed for this session/i,
		);
	} finally {
		sessions.shutdown();
	}
});

test("write_stdin rejects missing sessions", async () => {
	const sessions = createExecSessionManager();
	try {
		await assert.rejects(() => sessions.write({ session_id: 99999 }), /Unknown process id 99999/);
	} finally {
		sessions.shutdown();
	}
});

test("exec session manager strips terminal control noise from PTY output", async () => {
	const sessions = createExecSessionManager();
	try {
		let result = await sessions.exec(
			{
				cmd: "printf '\\033]11;rgb:0000/0000/0000\\007\\033[?2004hready\\001'",
				shell: "/bin/bash",
				login: false,
				tty: true,
				yield_time_ms: 50,
			},
			process.cwd(),
		);

		let output = result.output;
		for (let attempt = 0; attempt < 5 && result.session_id !== undefined; attempt++) {
			result = await sessions.write({ session_id: result.session_id, yield_time_ms: 50 });
			output += result.output;
		}

		assert.equal(output, "ready");
		assert.equal(result.exit_code, 0);
		assert.equal(result.session_id, undefined);
	} finally {
		sessions.shutdown();
	}
});
