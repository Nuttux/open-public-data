import { type ChatScope, type ChatScopeId } from "./scopes";
import { TOOL_SCHEMAS as PARIS_TOOL_SCHEMAS, DISPATCH as PARIS_DISPATCH } from "./paris/tools";
import { PARIS_SYSTEM_PROMPT } from "./paris/prompt";
import { SF_TOOL_SCHEMAS, SF_DISPATCH } from "./sf/tools";
import { SF_SYSTEM_PROMPT } from "./sf/prompt";

/**
 * Binds each scope to its toolset and its system prompt.
 *
 * The API route reads ONLY from here: it never assembles a tool list itself, so
 * a request can only ever be served the tools of the one scope it resolved to.
 * Tool names may repeat across scopes (both have list_datasets) — they are
 * looked up inside a scope's dispatch, never in a global table.
 */

type ToolSchema = { name: string; description: string; input_schema: unknown };
type Dispatch = Record<string, (args: Record<string, unknown>) => unknown>;

type Toolset = { schemas: readonly ToolSchema[]; dispatch: Dispatch };

const TOOLSETS: Record<ChatScopeId, Toolset> = {
  paris: { schemas: PARIS_TOOL_SCHEMAS as readonly ToolSchema[], dispatch: PARIS_DISPATCH },
  sf: { schemas: SF_TOOL_SCHEMAS as readonly ToolSchema[], dispatch: SF_DISPATCH },
};

const PROMPTS: Record<ChatScopeId, string> = {
  paris: PARIS_SYSTEM_PROMPT,
  sf: SF_SYSTEM_PROMPT,
};

/** Tool schemas to advertise to the model for this scope. */
export function toolSchemasFor(scope: ChatScope): readonly ToolSchema[] {
  return TOOLSETS[scope.id].schemas;
}

/** System prompt for this scope. Stable per scope, so it stays cacheable. */
export function systemPromptFor(scope: ChatScope): string {
  return PROMPTS[scope.id];
}

/**
 * Runs a tool inside a scope. An unknown name is reported rather than thrown so
 * the model can recover on the next turn; a name belonging to another scope's
 * toolset is simply unknown here, which is the containment we want.
 */
export function runScopedTool(scope: ChatScope, name: string, args: unknown): unknown {
  const fn = TOOLSETS[scope.id].dispatch[name];
  if (!fn) return { error: `unknown tool for scope ${scope.id}: ${name}` };
  const safeArgs = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  try {
    return fn(safeArgs);
  } catch (e) {
    return { error: `${(e as Error).name}: ${(e as Error).message}` };
  }
}
