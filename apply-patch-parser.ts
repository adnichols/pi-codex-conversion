import { normalizePatchPath } from "./apply-patch-paths.ts";
import { DiffError, type Chunk, type ParseMode, type ParserState, type Patch, type PatchAction } from "./apply-patch-types.ts";

function parserIsDone({ state, prefixes }: { state: ParserState; prefixes?: string[] }): boolean {
	if (state.index >= state.lines.length) {
		return true;
	}
	if (prefixes && prefixes.some((prefix) => state.lines[state.index].startsWith(prefix))) {
		return true;
	}
	return false;
}

function parserStartsWith({ state, prefix }: { state: ParserState; prefix: string }): boolean {
	if (state.index >= state.lines.length) {
		throw new DiffError(`Index: ${state.index} >= ${state.lines.length}`);
	}
	return state.lines[state.index].startsWith(prefix);
}

function parserReadStr({
	state,
	prefix,
	returnEverything,
}: {
	state: ParserState;
	prefix?: string;
	returnEverything?: boolean;
}): string {
	if (state.index >= state.lines.length) {
		throw new DiffError(`Index: ${state.index} >= ${state.lines.length}`);
	}

	const expectedPrefix = prefix ?? "";
	if (state.lines[state.index].startsWith(expectedPrefix)) {
		const text = returnEverything ? state.lines[state.index] : state.lines[state.index].slice(expectedPrefix.length);
		state.index += 1;
		return text;
	}
	return "";
}

function linesEqual({ left, right }: { left: string[]; right: string[] }): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index++) {
		if (left[index] !== right[index]) return false;
	}
	return true;
}

function findContextCore({ lines, context, start }: { lines: string[]; context: string[]; start: number }): {
	newIndex: number;
	fuzz: number;
} {
	if (context.length === 0) {
		return { newIndex: start, fuzz: 0 };
	}

	for (let index = start; index < lines.length; index++) {
		if (linesEqual({ left: lines.slice(index, index + context.length), right: context })) {
			return { newIndex: index, fuzz: 0 };
		}
	}

	for (let index = start; index < lines.length; index++) {
		const left = lines.slice(index, index + context.length).map((line) => line.trimEnd());
		const right = context.map((line) => line.trimEnd());
		if (linesEqual({ left, right })) {
			return { newIndex: index, fuzz: 1 };
		}
	}

	for (let index = start; index < lines.length; index++) {
		const left = lines.slice(index, index + context.length).map((line) => line.trim());
		const right = context.map((line) => line.trim());
		if (linesEqual({ left, right })) {
			return { newIndex: index, fuzz: 100 };
		}
	}

	return { newIndex: -1, fuzz: 0 };
}

function findContext({
	lines,
	context,
	start,
	eof,
}: {
	lines: string[];
	context: string[];
	start: number;
	eof: boolean;
}): { newIndex: number; fuzz: number } {
	if (eof) {
		const nearEnd = Math.max(lines.length - context.length, 0);
		const preferred = findContextCore({ lines, context, start: nearEnd });
		if (preferred.newIndex !== -1) {
			return preferred;
		}
		const fallback = findContextCore({ lines, context, start });
		return { newIndex: fallback.newIndex, fuzz: fallback.fuzz + 10000 };
	}
	return findContextCore({ lines, context, start });
}

function peekNextSection({ lines, index }: { lines: string[]; index: number }): {
	nextChunkContext: string[];
	chunks: Chunk[];
	endPatchIndex: number;
	eof: boolean;
} {
	const old: string[] = [];
	let delLines: string[] = [];
	let insLines: string[] = [];
	const chunks: Chunk[] = [];
	let mode: ParseMode = "keep";
	const origIndex = index;

	while (index < lines.length) {
		const rawLine = lines[index];
		if (
			rawLine.startsWith("@@") ||
			rawLine.startsWith("*** End Patch") ||
			rawLine.startsWith("*** Update File:") ||
			rawLine.startsWith("*** Delete File:") ||
			rawLine.startsWith("*** Add File:") ||
			rawLine.startsWith("*** End of File")
		) {
			break;
		}

		if (rawLine === "***") {
			break;
		}
		if (rawLine.startsWith("***")) {
			throw new DiffError(`Invalid Line: ${rawLine}`);
		}

		index += 1;
		const lastMode: ParseMode = mode;
		let line = rawLine;
		if (line === "") {
			line = " ";
		}

		if (line[0] === "+") {
			mode = "add";
		} else if (line[0] === "-") {
			mode = "delete";
		} else if (line[0] === " ") {
			mode = "keep";
		} else {
			throw new DiffError(`Invalid Line: ${line}`);
		}

		const value = line.slice(1);
		if (mode === "keep" && lastMode !== mode) {
			if (insLines.length > 0 || delLines.length > 0) {
				chunks.push({
					origIndex: old.length - delLines.length,
					delLines,
					insLines,
				});
			}
			delLines = [];
			insLines = [];
		}

		if (mode === "delete") {
			delLines.push(value);
			old.push(value);
		} else if (mode === "add") {
			insLines.push(value);
		} else {
			old.push(value);
		}
	}

	if (insLines.length > 0 || delLines.length > 0) {
		chunks.push({
			origIndex: old.length - delLines.length,
			delLines,
			insLines,
		});
	}

	if (index < lines.length && lines[index] === "*** End of File") {
		return {
			nextChunkContext: old,
			chunks,
			endPatchIndex: index + 1,
			eof: true,
		};
	}

	if (index === origIndex) {
		throw new DiffError(`Nothing in this section - index=${index} ${lines[index] ?? ""}`);
	}

	return {
		nextChunkContext: old,
		chunks,
		endPatchIndex: index,
		eof: false,
	};
}

function parseAddFile({ state }: { state: ParserState }): PatchAction {
	const lines: string[] = [];
	while (
		!parserIsDone({
			state,
			prefixes: ["*** End Patch", "*** Update File:", "*** Delete File:", "*** Add File:"],
		})
	) {
		const value = parserReadStr({ state, prefix: "" });
		if (!value.startsWith("+")) {
			throw new DiffError(`Invalid Add File Line: ${value}`);
		}
		lines.push(value.slice(1));
	}

	return {
		type: "add",
		newFile: lines.join("\n"),
		chunks: [],
	};
}

function parseUpdateFile({ state, text }: { state: ParserState; text: string }): PatchAction {
	const action: PatchAction = {
		type: "update",
		chunks: [],
	};

	const lines = text.split("\n");
	let index = 0;

	while (
		!parserIsDone({
			state,
			prefixes: ["*** End Patch", "*** Update File:", "*** Delete File:", "*** Add File:", "*** End of File"],
		})
	) {
		const defStr = parserReadStr({ state, prefix: "@@ " });
		let sectionStr = "";
		if (!defStr && state.index < state.lines.length && state.lines[state.index] === "@@") {
			sectionStr = state.lines[state.index];
			state.index += 1;
		}

		if (!(defStr || sectionStr || index === 0)) {
			throw new DiffError(`Invalid Line:\n${state.lines[state.index]}`);
		}

		if (defStr.trim().length > 0) {
			let found = false;

			const exactAlreadySeen = lines.slice(0, index).some((line) => line === defStr);
			if (!exactAlreadySeen) {
				for (let lineIndex = index; lineIndex < lines.length; lineIndex++) {
					if (lines[lineIndex] === defStr) {
						index = lineIndex + 1;
						found = true;
						break;
					}
				}
			}

			if (!found) {
				const trimAlreadySeen = lines.slice(0, index).some((line) => line.trim() === defStr.trim());
				if (!trimAlreadySeen) {
					for (let lineIndex = index; lineIndex < lines.length; lineIndex++) {
						if (lines[lineIndex].trim() === defStr.trim()) {
							index = lineIndex + 1;
							state.fuzz += 1;
							break;
						}
					}
				}
			}
		}

		const { nextChunkContext, chunks, endPatchIndex, eof } = peekNextSection({ lines: state.lines, index: state.index });
		const nextChunkText = nextChunkContext.join("\n");
		const { newIndex, fuzz } = findContext({
			lines,
			context: nextChunkContext,
			start: index,
			eof,
		});

		if (newIndex === -1) {
			if (eof) {
				throw new DiffError(`Invalid EOF Context ${index}:\n${nextChunkText}`);
			}
			throw new DiffError(`Invalid Context ${index}:\n${nextChunkText}`);
		}

		state.fuzz += fuzz;

		for (const chunk of chunks) {
			action.chunks.push({
				origIndex: chunk.origIndex + newIndex,
				delLines: chunk.delLines,
				insLines: chunk.insLines,
			});
		}

		index = newIndex + nextChunkContext.length;
		state.index = endPatchIndex;
	}

	return action;
}

export function parsePatchDocument({ text, originalFiles }: { text: string; originalFiles: Record<string, string> }): {
	patch: Patch;
	fuzz: number;
} {
	const lines = text.trim().split("\n");
	if (lines.length < 2 || !lines[0].startsWith("*** Begin Patch") || lines[lines.length - 1] !== "*** End Patch") {
		throw new DiffError("Invalid patch text");
	}

	const state: ParserState = {
		currentFiles: originalFiles,
		lines,
		index: 1,
		patch: { actions: {} },
		fuzz: 0,
	};

	while (!parserIsDone({ state, prefixes: ["*** End Patch"] })) {
		const updatePath = normalizePatchPath({ path: parserReadStr({ state, prefix: "*** Update File: " }) });
		if (updatePath) {
			if (state.patch.actions[updatePath]) {
				throw new DiffError(`Update File Error: Duplicate Path: ${updatePath}`);
			}
			const moveToRaw = parserReadStr({ state, prefix: "*** Move to: " });
			const moveTo = moveToRaw ? normalizePatchPath({ path: moveToRaw }) : undefined;
			if (!(updatePath in state.currentFiles)) {
				throw new DiffError(`Update File Error: Missing File: ${updatePath}`);
			}

			const action = parseUpdateFile({ state, text: state.currentFiles[updatePath] });
			action.movePath = moveTo;
			state.patch.actions[updatePath] = action;
			continue;
		}

		const deletePath = normalizePatchPath({ path: parserReadStr({ state, prefix: "*** Delete File: " }) });
		if (deletePath) {
			if (state.patch.actions[deletePath]) {
				throw new DiffError(`Delete File Error: Duplicate Path: ${deletePath}`);
			}
			if (!(deletePath in state.currentFiles)) {
				throw new DiffError(`Delete File Error: Missing File: ${deletePath}`);
			}
			state.patch.actions[deletePath] = {
				type: "delete",
				chunks: [],
			};
			continue;
		}

		const addPath = normalizePatchPath({ path: parserReadStr({ state, prefix: "*** Add File: " }) });
		if (addPath) {
			if (state.patch.actions[addPath]) {
				throw new DiffError(`Add File Error: Duplicate Path: ${addPath}`);
			}
			state.patch.actions[addPath] = parseAddFile({ state });
			continue;
		}

		throw new DiffError(`Unknown Line: ${state.lines[state.index]}`);
	}

	if (!parserStartsWith({ state, prefix: "*** End Patch" })) {
		throw new DiffError("Missing End Patch");
	}
	state.index += 1;

	return { patch: state.patch, fuzz: state.fuzz };
}

export function identifyFilesNeeded({ patchText }: { patchText: string }): string[] {
	const lines = patchText.trim().split("\n");
	const files = new Set<string>();
	for (const line of lines) {
		if (line.startsWith("*** Update File: ")) {
			files.add(normalizePatchPath({ path: line.slice("*** Update File: ".length) }));
		}
		if (line.startsWith("*** Delete File: ")) {
			files.add(normalizePatchPath({ path: line.slice("*** Delete File: ".length) }));
		}
	}
	return [...files];
}
