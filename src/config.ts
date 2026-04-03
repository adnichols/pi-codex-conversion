import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export const DISABLE_WEB_SEARCH_FLAG = "disable-codex-web-search";

interface CodexConversionSettings {
	piCodexConversion?: {
		disableWebSearch?: boolean;
	};
}

function readDisableWebSearchValue(settingsPath: string): boolean | undefined {
	if (!existsSync(settingsPath)) return undefined;

	try {
		const parsed = JSON.parse(readFileSync(settingsPath, "utf-8")) as CodexConversionSettings;
		return parsed.piCodexConversion?.disableWebSearch;
	} catch {
		return undefined;
	}
}

export function getDisableWebSearchFromSettings(cwd: string): boolean {
	const globalValue = readDisableWebSearchValue(join(homedir(), ".pi", "agent", "settings.json"));
	const projectValue = readDisableWebSearchValue(join(cwd, ".pi", "settings.json"));
	return projectValue ?? globalValue ?? false;
}

export function isCodexWebSearchDisabled(pi: ExtensionAPI, cwd: string): boolean {
	return pi.getFlag(DISABLE_WEB_SEARCH_FLAG) === true || getDisableWebSearchFromSettings(cwd);
}
