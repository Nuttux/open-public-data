import path from "node:path";

/**
 * An absolute path under the project that Next's file tracer does not follow.
 *
 * Every route is its own Vercel function, carrying the files the tracer
 * thinks it reads. Given `path.join(process.cwd(), "public", "data", rel)`,
 * Turbopack keeps the pieces it knows — "public", "data" — and packs the
 * whole directory into every function that imports the module: 10,483 files,
 * 382 MB, well over Vercel's 250 MB ceiling (13 Sep 2026).
 *
 * A `turbopackIgnore` comment only hides the expression right after it, and
 * the tracer re-evaluates any `path.join` whose other arguments it can still
 * read — so comments sprinkled at call sites leave the directory traced
 * (measured with probe routes, `next build --debug-build-paths`). Built
 * here, from arguments the tracer cannot see, the path is opaque wherever it
 * is used afterwards.
 *
 * What a route does read is declared instead: tracing-includes.json,
 * generated from measured reads by scripts/trace/. A loader that opens files
 * under public/ builds its path with this, and the chain there is re-run.
 */
export function untracedPath(...parts: string[]): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), /* turbopackIgnore: true */ ...parts);
}
