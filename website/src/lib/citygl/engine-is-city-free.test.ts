import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE MODULARITY RULE, ENFORCED RATHER THAN INTENDED.
 *
 * Daniel: *"start this rewrite in order to make my system modular so if
 * tomorrow I do another city I can change some underlying data but the engine
 * is the same."* An engine is only modular if nothing about one city has
 * leaked into it, and that is not something a reader can check by eye once the
 * directory is forty files. So it is a test.
 *
 * What may not appear in `lib/citygl/`: a city's name, a city's data path, or
 * a coordinate that could only belong to one place. Everything the engine
 * needs arrives in a `CityDescriptor` and, through it, that city's own
 * `manifest.json`.
 */
const ROOT = path.join(process.cwd(), "src", "lib", "citygl");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/**
 * COMMENTS ARE NOT CODE, and the first run of this test proved why that has
 * to be said: it failed on `descriptor.ts`, whose doc comment states the rule
 * — *"no San Francisco coordinate, no San Francisco constant"*. A file
 * explaining the rule is not a file breaking it. So the source is stripped of
 * its comments before it is searched, and what is left is what actually
 * compiles.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** A city's name, its data path, or a place only one city has. */
const FORBIDDEN: readonly { re: RegExp; why: string }[] = [
  { re: /\bsan\s*francisco\b/i, why: "a city's name" },
  { re: /\/data\/[a-z]{2}\/[a-z-]+\/city\b/i, why: "a city's data path" },
  { re: /\bsf\b(?!x)/i, why: "a city's short name" },
  { re: /\b(?:ferry building|golden gate|market st|treasure island|embarcadero)\b/i, why: "a landmark" },
  { re: /\bmarseille|recife|paris\b/i, why: "a city's name" },
];

describe("lib/citygl carries no city", () => {
  const files = walk(ROOT);

  it("has files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    const rel = path.relative(ROOT, f);
    it(`${rel} names no city`, () => {
      const src = code(readFileSync(f, "utf8"));
      const hits: string[] = [];
      for (const { re, why } of FORBIDDEN) {
        const m = re.exec(src);
        if (m) hits.push(`${why}: ${JSON.stringify(m[0])}`);
      }
      expect(hits, `${rel} must take this from its CityDescriptor`).toEqual([]);
    });
  }
});
