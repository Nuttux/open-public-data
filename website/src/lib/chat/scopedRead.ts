import { readDataJsonOrNull } from "../data/read";
import { resolveScopedPath, type ChatScope } from "./scopes";

/** Reads a JSON export relative to one scope's data root. Null outside it. */
export type ScopedReader = <T>(rel: string) => T | null;

/**
 * Every chat tool reads through one of these. Binding the reader to a scope at
 * construction time is what makes cross-city reads impossible by construction
 * rather than by convention: a toolset simply has no handle on another city.
 *
 * The underlying reader (lib/data/read.ts) memoizes, negative results included.
 */
export function createScopedReader(scope: ChatScope): ScopedReader {
  return function read<T>(rel: string): T | null {
    const path = resolveScopedPath(scope, rel);
    return path === null ? null : readDataJsonOrNull<T>(path);
  };
}
