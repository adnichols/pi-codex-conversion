import { dirname } from "node:path";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { identifyFilesNeeded, parsePatchDocument } from "./apply-patch-parser.ts";
import { openFileAtPath, pathExists, removeFileAtPath, resolvePatchPath, writeFileAtPath } from "./apply-patch-paths.ts";
import { DiffError, type Commit, type ExecutePatchResult, type Patch, type PatchAction } from "./apply-patch-types.ts";

function getUpdatedFile({ text, action, path }: { text: string; action: PatchAction; path: string }): string {
	if (action.type !== "update") {
		throw new DiffError(`Invalid action type for update: ${action.type}`);
	}

	const origLines = text.split("\n");
	const destLines: string[] = [];
	let origIndex = 0;
	let destIndex = 0;

	for (const chunk of action.chunks) {
		if (chunk.origIndex > origLines.length) {
			throw new DiffError(`_get_updated_file: ${path}: chunk.orig_index ${chunk.origIndex} > len(lines) ${origLines.length}`);
		}
		if (origIndex > chunk.origIndex) {
			throw new DiffError(`_get_updated_file: ${path}: orig_index ${origIndex} > chunk.orig_index ${chunk.origIndex}`);
		}

		destLines.push(...origLines.slice(origIndex, chunk.origIndex));
		const delta = chunk.origIndex - origIndex;
		origIndex += delta;
		destIndex += delta;

		for (const line of chunk.delLines) {
			if (origLines[origIndex] !== line) {
				throw new DiffError(`_get_updated_file: ${path}: Expected ${line} but got ${origLines[origIndex]} at line ${origIndex + 1}`);
			}
			origIndex += 1;
		}

		if (chunk.insLines.length > 0) {
			destLines.push(...chunk.insLines);
			destIndex += chunk.insLines.length;
		}
	}

	destLines.push(...origLines.slice(origIndex));
	const tailDelta = origLines.length - origIndex;
	origIndex += tailDelta;
	destIndex += tailDelta;

	if (origIndex !== origLines.length) {
		throw new DiffError(`Unexpected final orig_index for ${path}`);
	}
	if (destIndex !== destLines.length) {
		throw new DiffError(`Unexpected final dest_index for ${path}`);
	}

	return destLines.join("\n");
}

function patchToCommit({ patch, originalFiles }: { patch: Patch; originalFiles: Record<string, string> }): Commit {
	const commit: Commit = { changes: {} };

	for (const [path, action] of Object.entries(patch.actions)) {
		if (action.type === "delete") {
			commit.changes[path] = {
				type: "delete",
				oldContent: originalFiles[path],
			};
			continue;
		}

		if (action.type === "add") {
			commit.changes[path] = {
				type: "add",
				newContent: action.newFile ?? "",
			};
			continue;
		}

		const newContent = getUpdatedFile({ text: originalFiles[path], action, path });
		commit.changes[path] = {
			type: "update",
			oldContent: originalFiles[path],
			newContent,
			movePath: action.movePath,
		};
	}

	return commit;
}

function loadFiles({ paths, cwd }: { paths: string[]; cwd: string }): Record<string, string> {
	const files: Record<string, string> = {};
	for (const path of paths) {
		files[path] = openFileAtPath({ cwd, path });
	}
	return files;
}

// executePatch is kept pure with respect to patch parsing: all I/O is isolated
// to the final commit application phase so tests can exercise failure paths in
// small deterministic fixtures.
export function executePatch({ cwd, patchText }: { cwd: string; patchText: string }): ExecutePatchResult {
	if (!patchText.startsWith("*** Begin Patch")) {
		throw new DiffError("Patch must start with '*** Begin Patch'");
	}

	const requiredFiles = identifyFilesNeeded({ patchText });
	const originalFiles = loadFiles({ paths: requiredFiles, cwd });
	const { patch, fuzz } = parsePatchDocument({ text: patchText, originalFiles });
	const commit = patchToCommit({ patch, originalFiles });

	const changedFiles = new Set<string>();
	const createdFiles = new Set<string>();
	const deletedFiles = new Set<string>();
	const movedFiles = new Set<string>();

	for (const [path, change] of Object.entries(commit.changes)) {
		if (change.type === "delete") {
			removeFileAtPath({ cwd, path });
			changedFiles.add(path);
			deletedFiles.add(path);
			continue;
		}

		if (change.type === "add") {
			const { created } = writeFileAtPath({
				cwd,
				path,
				content: change.newContent ?? "",
			});
			changedFiles.add(path);
			if (created) {
				createdFiles.add(path);
			}
			continue;
		}

		if (change.newContent === undefined) {
			throw new DiffError(`Update File Error: Missing new content for ${path}`);
		}

		if (change.movePath) {
			const fromAbsolutePath = resolvePatchPath({ cwd, patchPath: path });
			const toAbsolutePath = resolvePatchPath({ cwd, patchPath: change.movePath });
			const destinationExisted = pathExists({ cwd, path: change.movePath });
			if (destinationExisted && fromAbsolutePath !== toAbsolutePath) {
				throw new DiffError(`Update File Error: Destination already exists: ${change.movePath}`);
			}

			mkdirSync(dirname(toAbsolutePath), { recursive: true });
			writeFileSync(toAbsolutePath, change.newContent, "utf8");
			if (fromAbsolutePath !== toAbsolutePath) {
				if (!pathExists({ cwd, path })) {
					throw new DiffError(`Update File Error: Missing source file: ${path}`);
				}
				unlinkSync(fromAbsolutePath);
			}

			changedFiles.add(path);
			changedFiles.add(change.movePath);
			movedFiles.add(`${path} -> ${change.movePath}`);
			if (!destinationExisted) {
				createdFiles.add(change.movePath);
			}
			if (fromAbsolutePath !== toAbsolutePath) {
				deletedFiles.add(path);
			}
			continue;
		}

		writeFileAtPath({ cwd, path, content: change.newContent });
		changedFiles.add(path);
	}

	return {
		changedFiles: [...changedFiles],
		createdFiles: [...createdFiles],
		deletedFiles: [...deletedFiles],
		movedFiles: [...movedFiles],
		fuzz,
	};
}
