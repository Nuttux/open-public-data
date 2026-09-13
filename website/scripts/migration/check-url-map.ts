/**
 * Coverage of the URL migration (lib/urls.ts) against what production
 * declares today: every URL in the live sitemaps of www., fr. and pt. must map
 * to exactly one new address, and no two pages may land on the same one.
 *
 *   npx tsx scripts/migration/check-url-map.ts            # the three hosts
 *   npx tsx scripts/migration/check-url-map.ts fr.qipu.org
 *
 * Writes the full mapping to $MIGRATION_OUT or the system temp dir (old → new) and
 * exits 1 on any unmapped URL or collision.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isIndexable, langForLegacyHost, legacyToNew } from '../../src/lib/urls';

const HOSTS = process.argv.slice(2).length ? process.argv.slice(2) : ['www.qipu.org', 'fr.qipu.org', 'pt.qipu.org'];
const UA = 'Mozilla/5.0 (compatible; QipuMigration/1.0; +https://www.qipu.org)';

async function text(url: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.ok) return r.text();
    await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
  }
  throw new Error(`fetch failed: ${url}`);
}

async function sitemapUrls(host: string): Promise<string[]> {
  const robots = await text(`https://${host}/robots.txt`);
  const segs = [...robots.matchAll(/^Sitemap:\s*(\S+)/gm)].map((m) => m[1]);
  const out: string[] = [];
  for (let i = 0; i < segs.length; i += 4) {
    const chunk = await Promise.all(segs.slice(i, i + 4).map(text));
    for (const xml of chunk) out.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()));
  }
  return out;
}

function family(p: string): string {
  const s = p.split('/').filter(Boolean);
  if (s[0] === 'fr' && s[1] === 'city' && s[2] !== 'paris' && s[2] !== 'marseille') return s.length === 3 ? '/fr/city/<commune>' : `/fr/city/<commune>/${s[3]}`;
  return '/' + s.slice(0, Math.min(s.length, 4)).map((x, i) => (i === 3 ? '*' : x)).join('/');
}

async function main() {
  const rows: string[] = ['old_url\tnew_path\tindexable'];
  const seen = new Map<string, string>();
  let unmapped = 0;
  let collisions = 0;
  let total = 0;
  let indexable = 0;
  const unmappedByFamily = new Map<string, number>();

  for (const host of HOSTS) {
    const lang = langForLegacyHost(host);
    const urls = await sitemapUrls(host);
    let hostIndexable = 0;
    for (const u of urls) {
      total++;
      const { pathname } = new URL(u);
      const next = legacyToNew(pathname, lang);
      if (!next) {
        unmapped++;
        const f = family(pathname);
        unmappedByFamily.set(f, (unmappedByFamily.get(f) ?? 0) + 1);
        continue;
      }
      const idx = isIndexable(next);
      if (idx) { indexable++; hostIndexable++; }
      const prev = seen.get(next);
      if (prev && prev !== u) {
        // The same page in the same language declared by two hosts would be a real collision.
        collisions++;
        if (collisions <= 10) console.error(`collision: ${prev} and ${u} → ${next}`);
      } else {
        seen.set(next, u);
      }
      rows.push(`${u}\t${next}\t${idx}`);
    }
    console.log(`${host.padEnd(14)} ${String(urls.length).padStart(7)} URL → ${String(hostIndexable).padStart(7)} indexables`);
  }

  // Outside the repo: a 300 000-line table has no business being committed.
  const outDir = process.env.MIGRATION_OUT ?? path.join(os.tmpdir(), 'qipu-migration');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'url-map.tsv'), rows.join('\n') + '\n');

  console.log(`\n${total} URL anciennes · ${seen.size} nouvelles adresses distinctes · ${indexable} indexables · ${unmapped} sans correspondance · ${collisions} collisions`);
  if (unmapped) console.log('sans correspondance, par famille :', Object.fromEntries(unmappedByFamily));
  console.log(`table complète : ${path.join(outDir, 'url-map.tsv')}`);
  process.exit(unmapped || collisions ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
