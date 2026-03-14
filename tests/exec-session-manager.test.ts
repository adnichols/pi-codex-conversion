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

		assert.equal(resumed.output, ":hello");
		assert.equal(resumed.final.session_id, undefined);
		assert.equal(resumed.final.exit_code, 0);
	} finally {
		sessions.shutdown();
	}
});

test("write_stdin returns an error result for missing sessions", async () => {
	const sessions = createExecSessionManager();
	try {
		const result = await sessions.write({ session_id: 99999 });
		assert.equal(result.exit_code, 1);
		assert.equal(result.output, "Session not found");
	} finally {
		sessions.shutdown();
	}
});
