export type ExecCommandStatus = "running" | "done";

export interface ExecCommandTracker {
	getState(command: string): ExecCommandStatus;
	recordStart(toolCallId: string, command: string): void;
	recordPersistentSession(command: string): void;
	recordEnd(toolCallId: string): void;
	recordCommandFinished(command: string): void;
}

export function createExecCommandTracker(): ExecCommandTracker {
	const commandByToolCallId = new Map<string, string>();
	const executionStateByCommand = new Map<string, ExecCommandStatus>();
	const persistentCommands = new Set<string>();

	return {
		getState(command) {
			return executionStateByCommand.get(command) ?? "running";
		},
		recordStart(toolCallId, command) {
			commandByToolCallId.set(toolCallId, command);
			executionStateByCommand.set(command, "running");
		},
		recordPersistentSession(command) {
			persistentCommands.add(command);
			executionStateByCommand.set(command, "running");
		},
		recordEnd(toolCallId) {
			const command = commandByToolCallId.get(toolCallId);
			if (!command) return;
			// Pi renderers do not currently receive toolCallId, so we track the
			// last-known state per command string for compact Exploring/Explored UI.
			if (!persistentCommands.has(command)) {
				executionStateByCommand.set(command, "done");
			}
			commandByToolCallId.delete(toolCallId);
		},
		recordCommandFinished(command) {
			persistentCommands.delete(command);
			executionStateByCommand.set(command, "done");
		},
	};
}
