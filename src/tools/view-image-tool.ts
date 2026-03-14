import { extname } from "node:path";
import { createReadTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const originalRead = createReadTool(process.cwd());

const VIEW_IMAGE_PARAMETERS = Type.Object({
	path: Type.String({ description: "Path to the local image file to inspect" }),
});

interface ViewImageParams {
	path: string;
}

function parseViewImageParams(params: unknown): ViewImageParams {
	if (!params || typeof params !== "object" || !("path" in params) || typeof params.path !== "string") {
		throw new Error("view_image requires a string 'path' parameter");
	}
	return { path: params.path };
}

export function registerViewImageTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "view_image",
		label: "view_image",
		description: "View a local image from the filesystem.",
		promptSnippet: "View a local image.",
		promptGuidelines: ["Use view_image only for image files. Use exec_command for text-file inspection."],
		parameters: VIEW_IMAGE_PARAMETERS,
		async execute(toolCallId, params, signal) {
			const typedParams = parseViewImageParams(params);
			const extension = extname(typedParams.path).toLowerCase();
			if (!IMAGE_EXTENSIONS.has(extension)) {
				throw new Error("view_image only supports png, jpg, jpeg, gif, and webp files. Use exec_command for text files.");
			}

			const result = await originalRead.execute(toolCallId, { path: typedParams.path }, signal);
			const hasImage = result.content.some((item) => item.type === "image");
			if (!hasImage) {
				throw new Error("view_image expected an image file. Use exec_command for text files.");
			}
			return result;
		},
		renderCall(args, theme) {
			return new Text(
				`${theme.fg("toolTitle", theme.bold("view_image"))} ${theme.fg("accent", typeof args.path === "string" ? args.path : "")}`,
				0,
				0,
			);
		},
		renderResult(result, { isPartial, expanded }, theme) {
			if (isPartial) {
				return new Text(theme.fg("warning", "Loading image..."), 0, 0);
			}
			const textBlock = result.content.find((item) => item.type === "text");
			let text = theme.fg("success", "Image loaded");
			if (expanded && textBlock?.type === "text") {
				text += `\n${theme.fg("dim", textBlock.text)}`;
			}
			return new Text(text, 0, 0);
		},
	});
}
