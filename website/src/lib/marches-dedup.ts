/**
 * Un même contrat publié par deux sources compte une fois.
 *
 * Constaté le 2026-09-15 sur Paris 2024, l'exercice où la liste de la Ville
 * (lots attribués, titulaire nommé) et la DECP (accords-cadres, souvent
 * « multi-attributaire ») se recouvrent : 14 paires, 533 M€ comptés deux fois
 * sur 3,18 Md€ affichés, dont les trois lots des cours Oasis et les lots du
 * génie climatique. Les numéros diffèrent (« 20242024T00109 » côté Ville,
 * « decp-2024T00118 » côté DECP), donc la fusion par numéro ne les voit pas.
 *
 * Règle, volontairement stricte pour ne jamais retirer deux contrats
 * distincts : une ligne DECP est retirée quand une ligne de la Ville, pas
 * encore appariée, porte le même montant maximum, la même date de
 * notification (au jour) et au moins un mot significatif commun dans l'objet.
 * L'appariement est un-pour-un : trois lots de 60 M€ signés le même jour
 * côté Ville absorbent au plus trois lignes DECP.
 */
export type DedupRow = {
  numero_marche?: string;
  objet?: string;
  montant_max?: number;
  date_notification?: string;
  _source_origin?: string;
};

export type DedupResult<T> = { rows: T[]; dropped: number; droppedAmount: number };

const MIN_AMOUNT = 100_000;

function tokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 5),
  );
}

function shareAWord(a: string, b: string): boolean {
  const ta = tokens(a);
  for (const w of tokens(b)) if (ta.has(w)) return true;
  return false;
}

const keyOf = (r: DedupRow) => `${Math.round(Number(r.montant_max ?? 0))}|${String(r.date_notification ?? "").slice(0, 10)}`;
const isDecp = (r: DedupRow) => r._source_origin === "decp" || String(r.numero_marche ?? "").startsWith("decp-");

export function dedupMixedSources<T extends DedupRow>(rows: T[]): DedupResult<T> {
  const hasList = rows.some((r) => !isDecp(r));
  const hasDecp = rows.some((r) => isDecp(r));
  if (!hasList || !hasDecp) return { rows, dropped: 0, droppedAmount: 0 };
  const byKey = new Map<string, T[]>();
  for (const r of rows) {
    if (isDecp(r)) continue;
    const k = keyOf(r);
    const arr = byKey.get(k) ?? [];
    arr.push(r);
    byKey.set(k, arr);
  }
  const out: T[] = [];
  let dropped = 0;
  let droppedAmount = 0;
  for (const r of rows) {
    if (!isDecp(r) || Number(r.montant_max ?? 0) < MIN_AMOUNT) {
      out.push(r);
      continue;
    }
    const candidates = byKey.get(keyOf(r)) ?? [];
    const i = candidates.findIndex((c) => shareAWord(c.objet ?? "", r.objet ?? ""));
    if (i === -1) {
      out.push(r);
      continue;
    }
    candidates.splice(i, 1);
    dropped += 1;
    droppedAmount += Number(r.montant_max ?? 0);
  }
  return { rows: out, dropped, droppedAmount };
}
