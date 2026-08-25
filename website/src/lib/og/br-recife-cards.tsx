import { shareCard } from "@/lib/og/card";
import { themeFor, themeImage, localPhotoDataUri } from "@/lib/og/theme-image";
import { ogFmtBrl, ogFmtPt } from "@/lib/og";
import { loadContrato, loadRecipient } from "@/lib/br/recife-data";
import { loadPlace, loadPlaceObras } from "@/lib/br/recife-places-data";
import { titleCasePt } from "@/lib/br/format";

/**
 * Recife share cards.
 *
 * Recife had no opengraph-image of its own at all, so every link shared from
 * the Brazilian tree rendered the site-wide French card.
 *
 * Portuguese throughout, BRL formatted pt-BR.
 */

const FONTE = "Prefeitura do Recife";

/** A share card must never 500 — a failed card means the shared link renders
 *  nothing at all. Any loader that throws (the exports use both a throwing and
 *  a nullable reader) degrades to a plainer card instead. */
function safe<T>(load: () => T): T | null {
  try {
    return load();
  } catch {
    return null;
  }
}


/**
 * The register's `objeto` is a full procurement paragraph in block capitals.
 * Title-case it and cut at a word boundary so the card carries a readable
 * headline rather than three lines of shouted legalese.
 */
function shortObjeto(raw: string, max = 110): string {
  const s = titleCasePt(raw.trim());
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > 40 ? cut.slice(0, at) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

export function renderRecifeLugarOg(slug: string) {
  const place = safe(() => loadPlace(slug));
  const obras = safe(() => loadPlaceObras(slug));
  const nome = place?.nome ?? "Recife";

  const total = obras?.obras_total ?? place?.obras_total ?? 0;
  const n = obras?.n_obras ?? place?.n_obras ?? 0;

  const own = localPhotoDataUri(place?.photo);
  const borrowed = own ? null : themeImage(themeFor(place?.familia, place?.tipo), "recife", "pt");

  return shareCard({
    route: "/lugares",
    kicker: [place?.familia, place?.bairro, "Recife"].filter(Boolean).join(" · "),
    title: nome,
    figure: total
      ? {
          label: "Investimento identificado",
          value: ogFmtBrl(total),
          qualifier: n ? `${ogFmtPt(n)} obras e contratos ligados a este endereço` : undefined,
        }
      : null,
    image: own ?? borrowed?.src ?? null,
    imageCaption: borrowed?.caption ?? null,
    source: FONTE,
    url: `qipu.org/br/city/recife/lugares/${slug}`,
  });
}

export function renderRecifeContratoOg(id: string) {
  const found = safe(() => loadContrato(id));
  const c = found?.contrato;

  const titulo = c?.objeto ? shortObjeto(c.objeto) : "Contrato da Prefeitura do Recife";
  // numero is null while the portal has not numbered the contract yet.
  const numero = c?.numero ? `Contrato ${c.numero}` : "Contrato sem número";

  const borrowed = themeImage(themeFor(c?.orgao, c?.objeto), "recife", "pt");

  return shareCard({
    route: "/contratos",
    kicker: [c?.orgao, numero].filter(Boolean).join(" · "),
    title: titulo,
    // valor_suspeito marks amounts larger than the city's whole annual budget:
    // withheld everywhere else on the site, so withheld here too.
    figure:
      c?.valor && !c.valor_suspeito
        ? {
            label: "Valor do contrato",
            value: ogFmtBrl(c.valor),
            qualifier: [c.modalidade, c.ano ? `assinado em ${c.ano}` : null].filter(Boolean).join(", "),
          }
        : null,
    image: borrowed?.src ?? null,
    imageCaption: borrowed?.caption ?? null,
    source: FONTE,
    url: `qipu.org/br/city/recife/contratos/${id}`,
  });
}

export function renderRecifeRecebedorOg(cnpj: string) {
  const r = safe(() => loadRecipient(cnpj));
  const nome = r?.nome ?? "Recebedor";

  const bars = (r?.by_year ?? [])
    .slice()
    .sort((a, b) => a.ano - b.ano)
    .slice(-8)
    .map((p) => ({ label: String(p.ano).slice(-2), v: p.pago || 0 }));

  // A contract-only supplier has no payment record: show what was contracted
  // rather than a zero that would read as "received nothing".
  const figure =
    r?.contratos_only && r?.total_contratado
      ? { label: "Total contratado", value: ogFmtBrl(r.total_contratado), qualifier: "sem pagamento registrado" }
      : r?.total_pago
        ? {
            label: "Total pago",
            value: ogFmtBrl(r.total_pago),
            qualifier: r.n_contratos ? `${ogFmtPt(r.n_contratos)} contratos com a prefeitura` : undefined,
          }
        : null;

  const borrowed = themeImage(themeFor(r?.tema, r?.principal_orgao), "recife", "pt");

  return shareCard({
    route: "/quem-recebe",
    kicker: [r?.principal_orgao, "Recife"].filter(Boolean).join(" · "),
    title: nome,
    figure,
    image: borrowed?.src ?? null,
    imageCaption: borrowed?.caption ?? null,
    bars,
    source: FONTE,
    url: `qipu.org/br/city/recife/quem-recebe/${cnpj}`,
  });
}
