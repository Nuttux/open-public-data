/**
 * Audit du dictionnaire de synonymes de recherche (src/lib/search-synonyms.ts).
 *
 * Usage : node scripts/audit-search-synonyms.mjs [--verbose]
 *
 * Trois vérifications :
 *  1. Cas de régression MUST-MATCH — des requêtes concept doivent retrouver
 *     des entités réelles des données (ex. « lgbt » → QUEER WEEK).
 *  2. Cas de régression MUST-NOT-MATCH — les faux positifs corrigés lors de
 *     l'audit 2026-07 ne doivent jamais réapparaître (ex. « musique » ne doit
 *     pas matcher une CONCERTATION).
 *  3. Scan générique — aucun terme du dictionnaire ne doit matcher une part
 *     démesurée des données (signe d'un homonyme administratif), hors
 *     exceptions assumées listées dans GENERIC_OK.
 *
 * Le dictionnaire (GROUPS) est lu directement depuis le fichier TS — source
 * de vérité unique. La logique de matching ci-dessous est une copie minimale
 * de celle de search-synonyms.ts : si vous changez la sémantique de matching
 * là-bas, répercutez-la ici.
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(ROOT, "src/lib/search-synonyms.ts");
const VERBOSE = process.argv.includes("--verbose");

// ── Dictionnaire : parsé depuis le TS (littéral simple) ─────────────────────
const src = readFileSync(LIB, "utf8");
const body = src.slice(src.indexOf("const GROUPS"), src.indexOf("/** Normalise"));
const GROUPS = [...body.matchAll(/\[([^\]]+)\]/g)].map((m) =>
  [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
);
if (GROUPS.length < 10) {
  console.error("✗ Échec du parsing de GROUPS depuis search-synonyms.ts");
  process.exit(1);
}

// ── Matching : copie minimale de search-synonyms.ts (garder en phase) ───────
const normSearch = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const parseTerm = (raw) =>
  raw.endsWith("*") ? { t: raw.slice(0, -1), prefix: true } : { t: raw, prefix: false };
const PARSED = GROUPS.map((g) => g.map(parseTerm));
const termMatchesWord = (term, word) =>
  term.prefix ? word.startsWith(term.t) : word === term.t;
const termInText = (term, padded) =>
  padded.includes(term.prefix ? ` ${term.t}` : ` ${term.t} `);
const altsFor = (typed) => {
  const out = [];
  for (const group of PARSED) {
    if (!group.some((t) => termMatchesWord(t, typed))) continue;
    for (const t of group) {
      if (termMatchesWord(t, typed)) continue;
      if (!out.some((o) => o.t === t.t && o.prefix === t.prefix)) out.push(t);
    }
  }
  return out;
};
const matches = (query, rawText) => {
  const hay = normSearch(rawText);
  const qNorm = normSearch(query);
  if (!qNorm) return true;
  if (hay.includes(qNorm)) return true;
  const padded = ` ${hay} `;
  if (qNorm.includes(" ") && altsFor(qNorm).some((a) => termInText(a, padded))) return true;
  return qNorm.split(" ").every(
    (tok) => hay.includes(tok) || altsFor(tok).some((a) => termInText(a, padded))
  );
};

// ── 1 + 2. Cas de régression (chaînes réelles des données 2023-2025) ────────
const MUST_MATCH = [
  ["lgbt", "QUEER WEEK"],
  ["lgbt", "CENTRE LESBIEN, GAI, BI ET TRANS"],
  ["lgbt", "ACADEMIE GAY ET LESBIENNE"],
  ["park", "JARDIN PARTAGE DU 20E"],
  ["vinci", "SOGEA ILE DE FRANCE"],
  ["vinci", "EUROVIA IDF/ENTRE JEAN LEFEBVRE IDF"],
  ["aide aux devoirs", "ENTRAIDE SCOLAIRE AMICALE"],
  ["nettoyage", "MARCHE DE NETTOIEMENT DES VOIES"],
  ["sdf", "HEBERGEMENT D URGENCE FAMILLES"],
  ["arbre", "Entretien et élagage des arbres de la Ville de Paris"],
  ["punaises", "TRAITEMENT DES NUISIBLES DANS LES ECOLES"],
];
const MUST_NOT_MATCH = [
  // Faux positifs corrigés (audit 2026-07) — homonymes administratifs.
  ["lgbt", "KM TRANS EXPRESS"],
  // Patronymes : `gay*` matchait des personnes physiques (GAYE, GAYET…).
  ["lgbt", "GAYET"],
  ["lgbt", "MEUNIER GAYNO"],
  ["lgbt", "GAYE"],
  ["musique", "MS - CONCERTATION REFONTE STRATÉGIE RÉSILIENCE"],
  ["musique", "SA1 ACBC LOT1 MAINTIEN/OPERATIONS EXTENSION/SECURITE RESEAUX"],
  ["musique", "OPERATEUR DE COMPETENCES"],
  ["sdf", "HÉBERGEMENT INFOR. ET MAINT. APPLICATION BALADES PARIS"],
  ["ecologie", "CS 33 RUE DU CMDT MOUCHOTTE-MODERNISATION GÉNIE CLIMATIQUE"],
  ["agriculture", "TVX TRAITEMENT INSECTES A LARVES CHARPENTE FERME MONTSOURIS"],
  ["agriculture", "Gestion des parcs de stationnement fermés et sur voirie"],
  ["jardin", "ROSA PARKS PARIS"],
  ["drogue", "APPROVISIONNEMENT PRODUITS ALIMENTAIRES ET BOISSONS NON ALCOOLISEES"],
  ["solidarite", "Restauration du Moulin de la Charité au Cimetière du Montparnasse"],
  ["sante", "Entretien et élagage des arbres : soin des arbres"],
  ["solaire", "ACBC SUPERVISION ENERGETIQUE BATIMENTS || EIFFAGE ENERGIE"],
];

let failures = 0;
for (const [q, text] of MUST_MATCH) {
  if (!matches(q, text)) { failures++; console.error(`✗ MUST-MATCH   « ${q} » ↛ "${text}"`); }
  else if (VERBOSE) console.log(`✓ must-match   « ${q} » → "${text}"`);
}
for (const [q, text] of MUST_NOT_MATCH) {
  if (matches(q, text)) { failures++; console.error(`✗ MUST-NOT     « ${q} » → "${text}" (faux positif réintroduit)`); }
  else if (VERBOSE) console.log(`✓ must-not     « ${q} » ↛ "${text}"`);
}

// ── 3. Scan générique sur les vraies données (si présentes) ─────────────────
// Termes assumés larges : matchent beaucoup, mais à raison (vraies écoles,
// vraies crèches…). Toute nouvelle entrée ici doit être justifiée.
const GENERIC_OK = new Set(["ecole*", "scolaire*", "creche*", "opera", "formation*"]);
const SUBV = join(ROOT, "public/data/subventions/beneficiaires_search.json");
if (existsSync(SUBV)) {
  const subv = JSON.parse(readFileSync(SUBV, "utf8")).data.map((d) => ` ${normSearch(d.name)} `);
  const marches = [];
  for (const y of [2023, 2024, 2025]) {
    const f = join(ROOT, `public/data/marches-publics/marches_${y}.json`);
    if (!existsSync(f)) continue;
    for (const it of JSON.parse(readFileSync(f, "utf8")).data) {
      marches.push(` ${normSearch(`${it.objet} ${it.fournisseur_nom || ""}`)} `);
    }
  }
  const S_MAX = Math.ceil(subv.length * 0.01);   // 1 % des bénéficiaires
  const M_MAX = Math.ceil(marches.length * 0.04); // 4 % des contrats
  for (const group of GROUPS) {
    for (const raw of group) {
      if (GENERIC_OK.has(raw)) continue;
      const term = parseTerm(raw);
      const s = subv.filter((h) => termInText(term, h)).length;
      const m = marches.filter((h) => termInText(term, h)).length;
      if (s > S_MAX || m > M_MAX) {
        failures++;
        console.error(`✗ GENERIQUE    « ${raw} » matche subv:${s}/${subv.length} marchés:${m}/${marches.length} — homonyme probable, resserrer ou ajouter à GENERIC_OK`);
      }
    }
  }
} else {
  console.log("(données absentes — scan générique sauté)");
}

if (failures) {
  console.error(`\n${failures} échec(s).`);
  process.exit(1);
}
console.log(`✓ Audit synonymes OK — ${GROUPS.length} groupes, ${GROUPS.flat().length} termes, ${MUST_MATCH.length + MUST_NOT_MATCH.length} cas de régression.`);
