import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { DiffError } from "./apply-patch-types.ts";

export function normalizePatchPath({ path }: { path: string }): string {
	const trimmed = path.trim();
	const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
	return withoutAt.replace(/^['"]|['"]$/g, "");
}

// Patch paths are intentionally confined to ctx.cwd so the adapter cannot write
// outside the active workspace even if the incoming patch text is malicious.
export function resolvePatchPath({ cwd, patchPath }: { cwd: string; patchPath: string }): string {
	const normalized = normalizePatchPath({ path: patchPath });
	if (!normalized) {
		throw new DiffError("Patch path cannot be empty");
	}
	if (isAbsolute(normalized)) {
		throw new DiffError("We do not support absolute paths.");
	}

	const absolutePath = resolve(cwd, normalized);
	const rel = relative(cwd, absolutePath);
	if (rel.startsWith("..") || isAbsolute(rel)) {
		throw new DiffError(`Path escapes working directory: ${normalized}`);
	}
	return absolutePath;
}

export function openFileAtPath({ cwd, path }: { cwd: string; path: string }): string {
	const absolutePath = resolvePatchPath({ cwd, patchPath: path });
	if (!existsSync(absolutePath)) {
		throw new DiffError(`File not found: ${path}`);
	}
	return readFileSync(absolutePath, "utf8");
}

export function writeFileAtPath({ cwd, path, content }: { cwd: string; path: string; content: string }): { created: boolean } {
	const absolutePath = resolvePatchPath({ cwd, patchPath: path });
	const created = !existsSync(absolutePath);
	mkdirSync(dirname(absolutePath), { recursive: true });
	writeFileSync(absolutePath, content, "utf8");
	return { created };
}

export function removeFileAtPath({ cwd, path }: { cwd: string; path: string }): void {
	const absolutePath = resolvePatchPath({ cwd, patchPath: path });
	if (!existsSync(absolutePath)) {
		throw new DiffError(`File not found: ${path}`);
	}
	unlinkSync(absolutePath);
}

export function pathExists({ cwd, path }: { cwd: string; path: string }): boolean {
	return existsSync(resolvePatchPath({ cwd, patchPath: path }));
}
