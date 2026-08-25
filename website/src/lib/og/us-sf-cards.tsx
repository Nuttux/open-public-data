import { shareCard } from "@/lib/og/card";
import { themeFor, themeImage, localPhotoDataUri } from "@/lib/og/theme-image";
import { ogFmtUsd, ogFmtEn } from "@/lib/og";
import { loadSfPlacesIndex, loadSfPlace } from "@/lib/us/sf-places-data";
import { loadSfPayee } from "@/lib/us/sf-payees-data";
import { loadSfContractFiche } from "@/app/us/city/sf/contracts/data";

/**
 * San Francisco share cards.
 *
 * Until these existed only /us had an opengraph-image, so every SF entity
 * shared the site-wide card — the same grey rectangle whatever you linked.
 *
 * English throughout: a shared SF link should read as an SF artifact, not as a
 * French site's page about SF.
 */

const SOURCE = "DataSF";

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


export function renderSfPlaceOg(slug: string) {
  // Counts live on the index entry; the photo lives on the fiche.
  const row = safe(() => loadSfPlacesIndex().find((r) => r.slug === slug)) ?? undefined;
  const fiche = safe(() => loadSfPlace(slug));
  const name = row?.name ?? fiche?.name ?? "San Francisco";

  // funds_usd is 0 for plenty of places (no contract payments recorded). Lead
  // with the archive there rather than print "$0", which reads as a finding.
  const figure = row?.funds_usd
    ? { label: "Contract dollars", value: ogFmtUsd(row.funds_usd), qualifier: "paid to vendors for work at this place" }
    : row?.n_documents
      ? { label: "Archive documents", value: ogFmtEn(row.n_documents), qualifier: "held at the Internet Archive" }
      : null;

  const own = localPhotoDataUri(fiche?.photo);
  const borrowed = own
    ? null
    : themeImage(themeFor(row?.kind, fiche?.family, fiche?.owning_dept?.name), "sf", "en");

  return shareCard({
    route: "/places",
    kicker: [row?.kind, "San Francisco"].filter(Boolean).join(" · "),
    title: name,
    figure,
    image: own ?? borrowed?.src ?? null,
    imageCaption: borrowed?.caption ?? null,
    source: fiche?.photo ? `${SOURCE} · Internet Archive` : SOURCE,
    url: `qipu.org/us/city/sf/places/place/${slug}`,
  });
}

export function renderSfPayeeOg(slug: string) {
  const payee = safe(() => loadSfPayee(slug));
  const name = payee?.name ?? "City payee";

  const years =
    payee?.first_year && payee?.last_year ? `across ${payee.first_year}–${payee.last_year}` : "";
  const dept = payee?.top_departments?.[0];

  const bars = Object.entries(payee?.by_year ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .slice(-8)
    .map(([y, v]) => ({ label: String(y).slice(-2), v: Number(v) || 0 }));

  const borrowed = themeImage(themeFor(dept, payee?.kind), "sf", "en");

  return shareCard({
    route: "/who-gets-paid",
    kicker: "Paid by the City · San Francisco",
    title: name,
    figure: payee?.total_paid_usd
      ? {
          label: "Total paid",
          value: ogFmtUsd(payee.total_paid_usd),
          qualifier: [years, dept].filter(Boolean).join(", "),
        }
      : null,
    image: borrowed?.src ?? null,
    imageCaption: borrowed?.caption ?? null,
    bars,
    source: SOURCE,
    url: `qipu.org/us/city/sf/who-gets-paid/payee/${slug}`,
  });
}

export function renderSfContractOg(contractNo: string) {
  const fiche = safe(() => loadSfContractFiche(contractNo));
  const c = fiche?.contract;

  // Prefer the plain-English relabel from the vulgarisation layer; the raw
  // register title is procurement boilerplate.
  const title = c?.title_clear ?? c?.title_plain ?? c?.title ?? `Contract ${contractNo}`;

  const borrowed = themeImage(themeFor(c?.department, c?.contract_type), "sf", "en");

  return shareCard({
    route: "/contracts",
    kicker: [c?.department, `Contract ${contractNo}`].filter(Boolean).join(" · "),
    title,
    figure: c?.agreed_usd
      ? {
          label: "Agreed",
          value: ogFmtUsd(c.agreed_usd),
          qualifier: c.paid_usd ? `${ogFmtUsd(c.paid_usd)} paid to date` : undefined,
        }
      : null,
    image: borrowed?.src ?? null,
    imageCaption: borrowed?.caption ?? null,
    source: SOURCE,
    url: `qipu.org/us/city/sf/contracts/contract/${contractNo}`,
  });
}
