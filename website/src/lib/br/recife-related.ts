/**
 * "Veja também" blocks of the Recife fiches (components/fiche/RelatedLinks.tsx).
 * Every row is read from the export the target route resolves against
 * (recipients.json, temas.json, orgaos.json…) and checked there before it is
 * listed, so no row can lead to a 404. Copy lives in the dictionaries under
 * `br.recife.related.*` (pt.ts, mirrored in en.ts).
 */
import type { RelatedBlock, RelatedRow } from "@/components/fiche/RelatedLinks";
import { fmtBrlCompact, slugTema, titleCasePt } from "@/lib/br/format";
import { loadOrgao, loadRecipient, loadTema, type RecipientDetail } from "@/lib/br/recife-data";
import type { RecifeLocale } from "@/lib/br/recife-answers";
import { relatedInt, relatedT } from "@/lib/related-t";

const BASE = "/br/city/recife";
const brl = (n: number) => ({ v: fmtBrlCompact(n), u: "" });

/**
 * Recipient: its theme and the theme's other main recipients, the other main
 * recipients paid by its main department, and the hub.
 */
export function recipientRelated(rec: RecipientDetail, locale: RecifeLocale): RelatedBlock | null {
  const t = relatedT(locale);
  const rows: RelatedRow[] = [];
  const seen = new Set<string>([rec.cnpj]);
  const tema = rec.tema ? loadTema(slugTema(rec.tema)) : null;
  if (tema) {
    rows.push({
      href: `${BASE}/tema/${tema.slug}`,
      label: t("br.recife.related.tema", { tema: tema.tema }),
      sub: t("br.recife.related.tema_sub", { n: relatedInt(tema.n_organizacoes, locale) }),
      amount: brl(tema.total_pago),
    });
    for (const r of tema.top_recebedores.filter((r) => !seen.has(r.cnpj) && r.total_pago > 0 && loadRecipient(r.cnpj)).slice(0, 2)) {
      seen.add(r.cnpj);
      rows.push({ href: `${BASE}/quem-recebe/${r.cnpj}`, label: r.nome, sub: t("br.recife.related.same_tema"), amount: brl(r.total_pago) });
    }
  }
  const main = (rec.by_orgao ?? []).find((o) => o.slug && loadOrgao(o.slug));
  const orgao = main?.slug ? loadOrgao(main.slug) : null;
  if (orgao) {
    const n = tema ? 2 : 4;
    for (const s of orgao.top_suppliers.filter((s) => !seen.has(s.cnpj) && s.pago > 0 && loadRecipient(s.cnpj)).slice(0, n)) {
      seen.add(s.cnpj);
      rows.push({ href: `${BASE}/quem-recebe/${s.cnpj}`, label: s.nome, sub: t("br.recife.related.same_orgao", { orgao: titleCasePt(orgao.orgao) }), amount: brl(s.pago) });
    }
  }
  rows.push({ href: `${BASE}/quem-recebe`, label: t("br.recife.related.hub_quem"), sub: t("br.recife.related.hub_quem_sub") });
  return { title: t("br.recife.related.title"), sub: t("br.recife.related.recipient_sub"), rows };
}
