import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DISABLE_WEB_SEARCH_FLAG, getDisableWebSearchFromSettings, isCodexWebSearchDisabled } from "../src/config.ts";

test("getDisableWebSearchFromSettings prefers project settings over global settings", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-codex-conversion-config-"));
	const originalHome = process.env.HOME;
	try {
		process.env.HOME = root;
		mkdirSync(join(root, ".pi", "agent"), { recursive: true });
		writeFileSync(
			join(root, ".pi", "agent", "settings.json"),
			JSON.stringify({ piCodexConversion: { disableWebSearch: false } }),
		);
		mkdirSync(join(root, "project", ".pi"), { recursive: true });
		writeFileSync(
			join(root, "project", ".pi", "settings.json"),
			JSON.stringify({ piCodexConversion: { disableWebSearch: true } }),
		);

		assert.equal(getDisableWebSearchFromSettings(join(root, "project")), true);
	} finally {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		rmSync(root, { recursive: true, force: true });
	}
});

test("isCodexWebSearchDisabled honors extension flag", () => {
	const pi = {
		getFlag(name: string) {
			return name === DISABLE_WEB_SEARCH_FLAG ? true : undefined;
		},
	} as { getFlag(name: string): boolean | string | undefined };

	assert.equal(isCodexWebSearchDisabled(pi as never, process.cwd()), true);
});
