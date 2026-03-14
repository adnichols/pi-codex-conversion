export const STATUS_KEY = "codex-adapter";
export const STATUS_TEXT = "\u001b[38;2;0;76;255mCodex adapter\u001b[0m";

export const DEFAULT_TOOL_NAMES = ["read", "bash", "edit", "write"];

// Real Codex does not expose Pi's dedicated write/edit tools. In adapter mode we
// keep the surface narrow and rely on apply_patch plus shell commands instead.
export const ADAPTER_TOOL_NAMES = ["exec_command", "apply_patch", "view_image"];
