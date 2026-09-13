#!/usr/bin/env node
/**
 * Bloc 3 of the URL migration: every hard-coded legacy path in the code
 * becomes a LOGICAL path (lib/urls.ts) — the address without its language —
 * and links, router calls and pathname reads go through the localizing
 * wrappers (components/LocalizedLink, lib/navigation).
 *
 *   node scripts/migration/rewrite-paths.mjs --dry-run
 *   node scripts/migration/rewrite-paths.mjs
 *
 * Only literals that START with a legacy path are rewritten (a quote, then
 * /fr/city/…), so import specifiers (@/app/…) and URLs of other sites are never
 * touched. Occurrences whose meaning may change (a prefix test like
 * startsWith("/fr/national"), a bare "/fr/") are listed for review, not
 * rewritten.
 */
import fs from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const SRC = path.join(WEB, 'src');
const DRY = process.argv.includes('--dry-run');

const SKIP = new Set([
  'lib/urls.ts',
  'lib/urls.test.ts',
  'proxy.ts',
  'lib/navigation.ts',
  'components/LocalizedLink.tsx',
  'lib/site-locale.ts',
]);

// [legacy prefix, logical prefix]. Longest first; a prefix matches only when
// followed by an end of path (/, quote, ?, #, $ of a template, backslash).
const RULES = [
  ['/fr/city/', '/france/'],
  ['/fr/national/', '/france/'],
  ['/fr/compare/', '/france/comparer/'],
  ['/us/city/sf', '/usa/san-francisco'],
  ['/us/national', '/usa/national'],
  ['/us/', '/usa/'],
  ['/br/city/recife', '/brasil/recife'],
  ['/br/', '/brasil/'],
  ['/comparer', '/france/comparer'],
];
// Bare roots, rewritten only when the literal IS that root (a link), reviewed otherwise.
const EXACT = [
  ['/us', '/usa'],
  ['/br', '/brasil'],
  ['/fr/national', '/france'],
  ['/fr/compare', '/france/comparer'],
];
// Escaped forms inside regular expressions.
const REGEX_RULES = [
  ['\\/fr\\/city\\/', '\\/france\\/'],
  ['\\/us\\/city\\/sf', '\\/usa\\/san-francisco'],
  ['\\/br\\/city\\/recife', '\\/brasil\\/recife'],
];
const REVIEW_PATTERNS = [
  /["'`]\/fr\/national["'`]/,
  /["'`]\/fr\/city["'`]/,
  /["'`]\/fr\/["'`]/,
  /["'`]\/fr["'`]/,
  /\\\/fr\\\/national/,
  /startsWith\(["'`]\/(us|br)["'`]\)/,
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const END = `(?=[/"'\`?#$\\\\]|$)`;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

let literalHits = 0;
let exactHits = 0;
let regexHits = 0;
let linkImports = 0;
let navImports = 0;
const changedFiles = new Set();
const review = [];

for (const full of walk(SRC)) {
  const rel = path.relative(SRC, full);
  if (SKIP.has(rel)) continue;
  let src = fs.readFileSync(full, 'utf8');
  const before = src;

  // Review list first, on the original text.
  src.split('\n').forEach((line, i) => {
    if (REVIEW_PATTERNS.some((re) => re.test(line))) review.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
  });

  for (const [from, to] of RULES) {
    const re = new RegExp(`(["'\`])${escape(from)}${from.endsWith('/') ? '' : END}`, 'g');
    src = src.replace(re, (m, q) => {
      literalHits++;
      return q + to;
    });
  }
  for (const [from, to] of EXACT) {
    const re = new RegExp(`(["'\`])${escape(from)}(["'\`])`, 'g');
    src = src.replace(re, (m, q1, q2) => {
      if (q1 !== q2) return m;
      exactHits++;
      return q1 + to + q2;
    });
  }
  for (const [from, to] of REGEX_RULES) {
    const parts = src.split(from);
    if (parts.length > 1) {
      regexHits += parts.length - 1;
      src = parts.join(to);
    }
  }

  // Link → the localizing wrapper.
  src = src.replace(/import\s+(\w+)\s+from\s+["']next\/link["'];?/g, (m, name) => {
    linkImports++;
    return `import ${name} from "@/components/LocalizedLink";`;
  });
  // useRouter / usePathname → lib/navigation (client files only import them).
  src = src.replace(/import\s*\{([^}]*)\}\s*from\s*["']next\/navigation["'];?/g, (m, names) => {
    if (!/\b(useRouter|usePathname)\b/.test(names)) return m;
    navImports++;
    return `import {${names}} from "@/lib/navigation";`;
  });

  if (src !== before) {
    changedFiles.add(rel);
    if (!DRY) fs.writeFileSync(full, src);
  }
}

console.log(`${DRY ? '[à blanc] ' : ''}chemins réécrits : ${literalHits} (+${exactHits} racines exactes, ${regexHits} dans des regex)`);
console.log(`imports Link → LocalizedLink : ${linkImports} · imports navigation → lib/navigation : ${navImports}`);
console.log(`fichiers modifiés : ${changedFiles.size}`);
console.log(`\nÀ relire à la main (${review.length}) :`);
for (const r of review) console.log('  ' + r);
