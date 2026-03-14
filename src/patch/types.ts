export type ActionType = "add" | "delete" | "update";
export type ParseMode = "keep" | "add" | "delete";

export interface Chunk {
	origIndex: number;
	delLines: string[];
	insLines: string[];
}

export interface PatchAction {
	type: ActionType;
	newFile?: string;
	chunks: Chunk[];
	movePath?: string;
}

export interface Patch {
	actions: Record<string, PatchAction>;
}

export interface ParserState {
	currentFiles: Record<string, string>;
	lines: string[];
	index: number;
	patch: Patch;
	fuzz: number;
}

export interface FileChange {
	type: ActionType;
	oldContent?: string;
	newContent?: string;
	movePath?: string;
}

export interface Commit {
	changes: Record<string, FileChange>;
}

export interface ExecutePatchResult {
	changedFiles: string[];
	createdFiles: string[];
	deletedFiles: string[];
	movedFiles: string[];
	fuzz: number;
}

export class DiffError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DiffError";
	}
}
