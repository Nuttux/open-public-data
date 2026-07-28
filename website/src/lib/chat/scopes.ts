/**
 * Chat scopes — which city the assistant is answering about.
 *
 * A scope is the ONLY thing that decides which data the model can reach. It is
 * resolved server-side from an opaque id sent by the client, never from a path
 * the model produces: tools take no `city` argument, so there is no argument
 * the model could set to read another city's exports.
 *
 * Adding a city = one entry here + a toolset and a prompt under lib/chat/<id>/.
 */

export type ChatScopeId = "paris" | "sf";

export type ChatScope = {
  id: ChatScopeId;
  /** City name as it should appear in prose. */
  cityLabel: string;
  /**
   * Prefix under public/data for this city's exports. Paris keeps its files at
   * the data root (rétro-compat, cf. ADR project_marseille_v1_decisions P0.2);
   * every other city lives under a sub-path.
   */
  dataPrefix: string;
  /** Route prefix for in-site links the assistant may emit. */
  basePath: string;
  currency: "EUR" | "USD";
  /** Language the prompt is written in — also the fallback answer language. */
  promptLang: "fr" | "en";
};

export const CHAT_SCOPES: Record<ChatScopeId, ChatScope> = {
  paris: {
    id: "paris",
    cityLabel: "Paris",
    dataPrefix: "",
    basePath: "/fr/city/paris",
    currency: "EUR",
    promptLang: "fr",
  },
  sf: {
    id: "sf",
    cityLabel: "San Francisco",
    dataPrefix: "us/sf",
    basePath: "/us/city/sf",
    currency: "USD",
    promptLang: "en",
  },
};

export const DEFAULT_SCOPE_ID: ChatScopeId = "paris";

/** Narrows an untrusted string (request body, query param) to a known scope. */
export function resolveScope(id: unknown): ChatScope {
  return typeof id === "string" && id in CHAT_SCOPES
    ? CHAT_SCOPES[id as ChatScopeId]
    : CHAT_SCOPES[DEFAULT_SCOPE_ID];
}

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Which scope a page belongs to, or null when no city on this route has a
 * toolset yet. Used by the client to tell the API what the reader is looking
 * at; the server re-validates through resolveScope.
 *
 * Returning null matters as much as returning a scope: a page whose city has
 * no toolset must show no assistant at all, rather than one that would answer
 * confidently with another city's numbers.
 */
export function scopeForPath(pathname: string): ChatScopeId | null {
  if (under(pathname, "/us/city/sf")) return "sf";
  // Recife is Portuguese and has no toolset; /us national and other cities
  // under /fr/city (Marseille…) read from their own exports, which no scope
  // covers yet.
  if (under(pathname, "/us") || under(pathname, "/br")) return null;
  if (pathname.startsWith("/fr/city/") && !under(pathname, "/fr/city/paris")) return null;
  return DEFAULT_SCOPE_ID;
}

/** Whether the assistant should be mounted at all on this route. */
export function isChatEnabledPath(pathname: string): boolean {
  return scopeForPath(pathname) !== null;
}

/**
 * Data roots that belong to a city OTHER than Paris. Paris reads from the data
 * root, so without this list a malformed relative path could walk into another
 * city's exports. Every non-Paris scope is confined by its own prefix instead.
 */
const FOREIGN_ROOTS = new Set(["us", "br", "ca", "fr", "marseille", "national", "communes", "communes-all"]);

/**
 * Resolves a tool-supplied relative path inside a scope, or null if it escapes.
 * Tool paths are authored in code, but years and slugs are interpolated from
 * model arguments — this is the backstop that keeps a crafted argument from
 * reaching another city's files.
 */
export function resolveScopedPath(scope: ChatScope, rel: string): string | null {
  if (!rel || rel.startsWith("/") || rel.includes("..") || rel.includes("\0")) return null;
  if (scope.dataPrefix === "" && FOREIGN_ROOTS.has(rel.split("/")[0])) return null;
  return scope.dataPrefix ? `${scope.dataPrefix}/${rel}` : rel;
}
