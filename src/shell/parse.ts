import type { ShellAction } from "./types.ts";
import { isAbsoluteLike, joinPaths, shortDisplayPath } from "./tokenize.ts";

export function parseShellPart(tokens: string[], cwd?: string): ShellAction | null {
	if (tokens.length === 0) return null;

	if (tokens[0] === "cd") {
		return null;
	}

	const parsed = parseMainTokens(tokens);
	if (parsed === null) return null;
	if (parsed.kind === "run") return parsed;

	if (parsed.kind === "read" && cwd && !isAbsoluteLike(parsed.path)) {
		return {
			...parsed,
			path: joinPaths(cwd, parsed.path),
		};
	}
	return parsed;
}

export function nextCwd(currentCwd: string | undefined, tokens: string[]): string | undefined {
	if (tokens[0] !== "cd") return currentCwd;
	const target = cdTarget(tokens.slice(1));
	if (!target) return currentCwd;
	return currentCwd ? joinPaths(currentCwd, target) : target;
}

function parseMainTokens(tokens: string[]): ShellAction | null {
	const [head, ...tail] = tokens;
	if (!head) return null;

	if (head === "echo" || head === "true") {
		return null;
	}

	if (head === "ls" || head === "eza" || head === "exa" || head === "tree" || head === "du") {
		const flagsWithValues =
			head === "tree"
				? ["-L", "-P", "-I", "--charset", "--filelimit", "--sort"]
				: head === "du"
					? ["-d", "--max-depth", "-B", "--block-size", "--exclude", "--time-style"]
					: head === "ls"
						? ["-I", "--ignore", "-w", "--block-size", "--format", "--time-style", "--color"]
						: ["-I", "--ignore-glob", "--color", "--sort", "--time-style", "--time"];
		const path = firstNonFlagOperand(tail, flagsWithValues);
		return { kind: "list", command: tokens.join(" "), path: path ? shortDisplayPath(path) : undefined };
	}

	if (head === "rg" || head === "rga" || head === "ripgrep-all") {
		const hasFilesFlag = tail.includes("--files");
		const candidates = skipFlagValues(tail, [
			"-g",
			"--glob",
			"--iglob",
			"-t",
			"--type",
			"--type-add",
			"--type-not",
			"-m",
			"--max-count",
			"-A",
			"-B",
			"-C",
			"--context",
			"--max-depth",
		]);
		const nonFlags = candidates.filter((token) => !token.startsWith("-"));
		if (hasFilesFlag) {
			const path = nonFlags[0];
			return { kind: "list", command: tokens.join(" "), path: path ? shortDisplayPath(path) : undefined };
		}
		return {
			kind: "search",
			command: tokens.join(" "),
			query: nonFlags[0],
			path: nonFlags[1] ? shortDisplayPath(nonFlags[1]) : undefined,
		};
	}

	if (head === "git" && tail[0] === "grep") {
		return parseGrepLike(tokens.join(" "), tail.slice(1));
	}

	if (head === "git" && tail[0] === "ls-files") {
		const path = firstNonFlagOperand(tail.slice(1), ["--exclude", "--exclude-from", "--pathspec-from-file"]);
		return { kind: "list", command: tokens.join(" "), path: path ? shortDisplayPath(path) : undefined };
	}

	if (head === "fd") {
		const nonFlags = skipFlagValues(tail, ["-g", "--glob", "-e", "--extension", "-E", "--exclude"]).filter(
			(token) => !token.startsWith("-"),
		);
		if (nonFlags.length === 0) {
			return { kind: "list", command: tokens.join(" ") };
		}
		if (nonFlags.length === 1) {
			return { kind: "list", command: tokens.join(" "), path: shortDisplayPath(nonFlags[0]) };
		}
		return {
			kind: "search",
			command: tokens.join(" "),
			query: nonFlags[0],
			path: shortDisplayPath(nonFlags[1]),
		};
	}

	if (head === "find") {
		const path = tail.find((token) => !token.startsWith("-"));
		const nameIndex = tail.findIndex((token) => token === "-name" || token === "-iname");
		const query = nameIndex !== -1 ? tail[nameIndex + 1] : undefined;
		if (query) {
			return {
				kind: "search",
				command: tokens.join(" "),
				query,
				path: path ? shortDisplayPath(path) : undefined,
			};
		}
		return { kind: "list", command: tokens.join(" "), path: path ? shortDisplayPath(path) : undefined };
	}

	if (head === "grep" || head === "egrep" || head === "fgrep" || head === "ag" || head === "ack" || head === "pt") {
		return parseGrepLike(tokens.join(" "), tail);
	}

	if (head === "cat" || head === "bat" || head === "batcat" || head === "less" || head === "more") {
		const path = singleNonFlagOperand(tail, [
			"--theme",
			"--language",
			"--style",
			"--terminal-width",
			"--tabs",
			"--line-range",
			"--map-syntax",
			"-p",
			"-P",
			"-x",
			"-y",
			"-z",
			"-j",
			"--pattern",
			"--prompt",
			"--shift",
			"--jump-target",
		]);
		return path ? readAction(tokens.join(" "), path) : { kind: "run", command: tokens.join(" ") };
	}

	if (head === "head") {
		const path = readPathFromHeadTail(tail, "head");
		return path ? readAction(tokens.join(" "), path) : null;
	}

	if (head === "tail") {
		const path = readPathFromHeadTail(tail, "tail");
		return path ? readAction(tokens.join(" "), path) : null;
	}

	if (head === "nl") {
		const candidates = skipFlagValues(tail, ["-s", "-w", "-v", "-i", "-b"]);
		const path = candidates.find((token) => !token.startsWith("-"));
		return path ? readAction(tokens.join(" "), path) : null;
	}

	if (head === "sed") {
		const path = sedReadPath(tail);
		return path ? readAction(tokens.join(" "), path) : null;
	}

	return { kind: "run", command: tokens.join(" ") };
}

function parseGrepLike(command: string, tail: string[]): ShellAction {
	const candidates = skipFlagValues(tail, [
		"-e",
		"-f",
		"-g",
		"-G",
		"--glob",
		"--include",
		"--exclude",
		"--exclude-dir",
		"--exclude-from",
		"--ignore-dir",
	]);
	const nonFlags = candidates.filter((token) => !token.startsWith("-"));
	return {
		kind: "search",
		command,
		query: nonFlags[0],
		path: nonFlags[1] ? shortDisplayPath(nonFlags[1]) : undefined,
	};
}

function readAction(command: string, path: string): ShellAction {
	return {
		kind: "read",
		command,
		name: shortDisplayPath(path),
		path,
	};
}

function readPathFromHeadTail(args: string[], tool: "head" | "tail"): string | undefined {
	if (args.length === 1 && !args[0].startsWith("-")) {
		return args[0];
	}

	const tokens = [...args];
	let index = 0;
	while (index < tokens.length) {
		const token = tokens[index];
		if (!token) break;
		if (!token.startsWith("-")) {
			return token;
		}
		if ((token === "-n" || token === "-c") && index + 1 < tokens.length) {
			index += 2;
			continue;
		}
		if ((tool === "head" || tool === "tail") && /^-[nc].+/.test(token)) {
			index += 1;
			continue;
		}
		index += 1;
	}

	return undefined;
}

function sedReadPath(args: string[]): string | undefined {
	if (!args.includes("-n")) return undefined;

	let hasRangeScript = false;
	for (let index = 0; index < args.length; index++) {
		const token = args[index];
		if ((token === "-e" || token === "--expression") && isValidSedRange(args[index + 1])) {
			hasRangeScript = true;
		}
		if (!token.startsWith("-") && isValidSedRange(token)) {
			hasRangeScript = true;
		}
	}
	if (!hasRangeScript) return undefined;

	const candidates = skipFlagValues(args, ["-e", "-f", "--expression", "--file"]);
	const nonFlags = candidates.filter((token) => !token.startsWith("-"));
	if (nonFlags.length === 0) return undefined;
	if (isValidSedRange(nonFlags[0])) {
		return nonFlags[1];
	}
	return nonFlags[0];
}

function isValidSedRange(value: string | undefined): boolean {
	if (!value || !value.endsWith("p")) return false;
	const core = value.slice(0, -1);
	const parts = core.split(",");
	return parts.length >= 1 && parts.length <= 2 && parts.every((part) => part.length > 0 && /^\d+$/.test(part));
}

function firstNonFlagOperand(args: string[], flagsWithValues: string[]): string | undefined {
	return skipFlagValues(args, flagsWithValues).find((token) => !token.startsWith("-"));
}

function singleNonFlagOperand(args: string[], flagsWithValues: string[]): string | undefined {
	const nonFlags = skipFlagValues(args, flagsWithValues).filter((token) => !token.startsWith("-"));
	return nonFlags.length === 1 ? nonFlags[0] : undefined;
}

function skipFlagValues(args: string[], flagsWithValues: string[]): string[] {
	const out: string[] = [];
	for (let index = 0; index < args.length; index++) {
		const token = args[index];
		out.push(token);
		if (flagsWithValues.includes(token) && index + 1 < args.length) {
			index += 1;
		}
	}
	return out;
}

function cdTarget(args: string[]): string | undefined {
	for (let index = 0; index < args.length; index++) {
		const token = args[index];
		if (token === "--") {
			continue;
		}
		if (!token.startsWith("-")) {
			return token;
		}
	}
	return undefined;
}
