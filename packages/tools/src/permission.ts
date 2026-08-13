import type { PermissionMode, PermissionPolicy, ToolDefinition, ToolPermissionLevel } from "@dikabuff/shared";
import type { ToolPolicy } from "@dikabuff/shared";

/** Default policy per permission tier. */
const TIER_DEFAULT: Record<ToolPermissionLevel, PermissionPolicy> = {
  safe: "allow",
  standard: "allow",
  sensitive: "ask",
  dangerous: "ask",
};

/** Map a tool to its effective policy, honoring config overrides. */
export function resolvePolicy(
  tool: Pick<ToolDefinition, "name" | "permission" | "category">,
  policy: ToolPolicy,
): PermissionPolicy {
  const perTool = policy.tools[tool.name];
  if (perTool) return perTool;
  const perCategory = policy.categories[tool.category];
  if (perCategory) return perCategory;
  return TIER_DEFAULT[tool.permission];
}

/**
 * Apply the global permission mode on top of the resolved policy.
 *  - default:           no change (per-tool/per-category rules decide)
 *  - acceptEdits:       file edits auto-approved; terminal still asks
 *  - plan:              read-only — mutating/terminal tools are denied
 *  - bypassPermissions: everything approved (explicit opt-in)
 */
export function applyPermissionMode(
  mode: PermissionMode,
  tool: Pick<ToolDefinition, "name" | "permission" | "category">,
  resolved: PermissionPolicy,
): PermissionPolicy {
  switch (mode) {
    case "bypassPermissions":
      return "allow";
    case "acceptEdits":
      if (resolved === "deny") return "deny"; // explicit deny always wins
      if (tool.category === "filesystem" && (tool.permission === "sensitive" || tool.permission === "dangerous")) return "allow";
      return resolved;
    case "plan":
      if (tool.category === "terminal") return "deny";
      if (tool.permission === "sensitive" || tool.permission === "dangerous") return "deny";
      return resolved;
    case "default":
    default:
      return resolved;
  }
}

/** Human description shown in the permission dialog. */
export function describeTool(tool: Pick<ToolDefinition, "name" | "description">, args: Record<string, unknown>): string {
  const keys = Object.keys(args).slice(0, 3);
  const detail = keys.length
    ? keys.map((k) => `${k}=${String(args[k]).slice(0, 60)}`).join(", ")
    : "no arguments";
  return `${tool.description}\n    ${tool.name}(${detail})`;
}

export const TIER_LABEL: Record<ToolPermissionLevel, string> = {
  safe: "safe",
  standard: "standard",
  sensitive: "sensitive",
  dangerous: "dangerous",
};