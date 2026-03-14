import { readFileSync } from "node:fs";

const SYSTEM_PROMPT_TEMPLATE = readFileSync(new URL("./system-prompt.md", import.meta.url), "utf8").trim();

export function buildCodexSystemPrompt(cwd: string): string {
	return SYSTEM_PROMPT_TEMPLATE.replace("{{CURRENT_DATE}}", new Date().toISOString().slice(0, 10)).replace(
		"{{CURRENT_WORKING_DIRECTORY}}",
		cwd.replace(/\\/g, "/"),
	);
}
