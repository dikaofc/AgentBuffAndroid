import type { ToolDefinition } from "@dikabuff/shared";
import type { ToolRegistry } from "../registry";
import { FILESYSTEM_TOOLS } from "./filesystem";
import { TERMINAL_TOOLS } from "./terminal";
import { DEVELOPMENT_TOOLS } from "./development";
import { ANALYSIS_TOOLS } from "./analysis";
import { projectScan } from "./analysis";
import { subagentTool } from "./subagent";
import { webSearchTool } from "./web";
import { askUserTool } from "./ask";

/**
 * Register every built-in tool on a registry.
 * Bundled scan is exported separately for use by `dikabuff analyze` without
 * going through the full agent.
 */
export function registerBuiltinTools(registry: ToolRegistry): ToolDefinition[] {
  const all: ToolDefinition[] = [
    ...FILESYSTEM_TOOLS,
    ...TERMINAL_TOOLS,
    ...DEVELOPMENT_TOOLS,
    ...ANALYSIS_TOOLS,
    subagentTool as ToolDefinition,
    webSearchTool as ToolDefinition,
    askUserTool as ToolDefinition,
  ];
  registry.registerMany(all);
  return all;
}

export { projectScan };
export { SKIP_DIRS, walk } from "./filesystem";

export { runCommand, detectPackageManager, scriptFromPackageJson } from "./terminal";

export { FILESYSTEM_TOOLS, TERMINAL_TOOLS, DEVELOPMENT_TOOLS, ANALYSIS_TOOLS };
export { subagentTool };
export { webSearchTool };
export { askUserTool };