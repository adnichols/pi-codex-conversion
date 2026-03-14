# pi-codex-conversion

Codex-oriented adapter for [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

This package replaces Pi's default Codex/GPT experience with a narrower Codex-like surface:

- swaps active tools to `exec_command`, `write_stdin`, `apply_patch`, and `view_image`
- replaces the default system prompt with a compact prompt built from `src/prompt/system-prompt.md`
- renders read-like shell commands as compact `Exploring` / `Explored` summaries

## Active tools in adapter mode

When the adapter is active, the LLM sees these tools:

- `exec_command` — shell execution with Codex-style `cmd` parameters and resumable sessions
- `write_stdin` — continue or poll a running exec session
- `apply_patch` — patch tool
- `view_image` — image-only wrapper around Pi's native `read`

Notably:

- there is **no** dedicated `read`, `edit`, or `write` tool in adapter mode
- local text-file inspection should happen through `exec_command`
- file creation and edits should default to `apply_patch`

## Layout

- `src/index.ts` — extension entrypoint, model gating, tool-set swapping, prompt replacement
- `src/adapter/` — model detection and active-tool constants
- `src/tools/` — Pi tool wrappers, exec session management, and execution rendering
- `src/shell/` — shell tokenization, parsing, and exploration summaries
- `src/patch/` — patch parsing, path policy, and execution
- `src/prompt/` — compact prompt template and runtime builder
- `tests/` — deterministic unit tests

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
- `exec_command({ cmd: "npm test", yield_time_ms: 1000 })` may return `session_id`, then continue with `write_stdin`

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
- `write_stdin` is implemented with pipe-backed child processes; it is closer to Codex behavior, but not a full PTY implementation.

## License

MIT
