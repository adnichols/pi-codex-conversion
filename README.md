# pi-codex-conversion

Codex-compatible adapter for [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

This package replaces Pi's default Codex/GPT experience with a narrower Codex-style surface:

- swaps Pi tools to `exec_command`, `apply_patch`, `write`, and `view_image`
- replaces the default system prompt with `system-prompt.md`
- renders read-like shell commands as compact `Exploring` / `Explored` summaries

## Active tools in adapter mode

When the adapter is active, the LLM sees these tools:

- `exec_command` — wraps Pi's native `bash`
- `apply_patch` — Codex-style patch tool
- `write` — Pi's native write tool
- `view_image` — image-only wrapper around Pi's native `read`

Notably:

- there is **no general local text-file read tool** in adapter mode
- local text-file inspection should happen through `exec_command`
- Pi's native `edit` tool is not exposed in adapter mode; use `apply_patch` or `write`

## Quick map

- `index.ts` — extension entrypoint, model gating, tool-set swapping, prompt replacement
- `codex-model.ts` — conservative Codex/GPT model detection
- `exec-command-tool.ts` — `exec_command` wrapper around Pi `bash`
- `view-image-tool.ts` — image-only view tool wrapper
- `codex-rendering.ts` — compact `Exploring` / `Explored` call rendering
- `codex-shell-summary.ts` — shell exploration classification entrypoint
- `shell-tokenize.ts` / `shell-parse.ts` — shell tokenization and command-shape heuristics
- `apply-patch.ts` — tool registration for `apply_patch`
- `apply-patch-core.ts` / `apply-patch-parser.ts` / `apply-patch-paths.ts` / `apply-patch-types.ts` — patch parsing and execution lanes
- `system-prompt.md` — reviewable replacement system prompt
- `tests/*.test.ts` — deterministic hardening tests

## Checks

```bash
npm run typecheck
npm test
npm run check
```

## Examples

- `rg -n foo src` -> `Explored / Search foo in src`
- `rg --files src | head -n 50` -> `Explored / List src`
- `cat README.md` -> `Explored / Read README.md`

Raw command output is still available by expanding the tool result.

## Install

```bash
pi install ./pi-codex-conversion
```

## Notes

- Adapter mode activates automatically for OpenAI `gpt*` and `codex*` models.
- When you switch away from those models, Pi restores the previous active tool set.
- `view_image` only accepts `png`, `jpg`, `jpeg`, `gif`, and `webp`.
- `apply_patch` paths stay restricted to the current working directory.

## License

MIT
