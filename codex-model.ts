import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

export interface CodexLikeModelDescriptor {
	provider: string;
	api: string;
	id: string;
}

// Keep model detection intentionally conservative. The adapter replaces the
// system prompt and tool surface, so false positives are worse than misses.
export function isCodexLikeModel(model: Partial<CodexLikeModelDescriptor> | null | undefined): boolean {
	if (!model) return false;

	const provider = (model.provider ?? "").toLowerCase();
	const api = (model.api ?? "").toLowerCase();
	const id = (model.id ?? "").toLowerCase();
	return provider.includes("codex") || api.includes("codex") || id.includes("codex") || (provider.includes("openai") && id.includes("gpt"));
}

export function isCodexLikeContext(ctx: ExtensionContext): boolean {
	return isCodexLikeModel(ctx.model);
}
