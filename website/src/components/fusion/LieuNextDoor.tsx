"use client";

import { NextDoor } from "@/components/fiche/Doors";
import { useCity } from "./CityContext";
import { useLocale, useT } from "@/lib/localeContext";
import { useFmtEur } from "@/lib/use-fmt";
import { fill, numLocale, sufOrdinal } from "@/lib/fmt";
import type { LieuSuivant } from "@/lib/lieux-data";

/**
 * « Lieu suivant » at the foot of a place fiche (2026-09-16): the next place
 * of the same family by amount — the way out that is not the footer, as on
 * the worksite, association and landlord fiches. Rendered by the entity after
 * the « Autres lieux » thumbnails, on the page and in the drawer alike.
 */
export default function LieuNextDoor({ next }: { next: LieuSuivant | null | undefined }) {
  const t = useT();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const fmtEur = useFmtEur();
  if (!next) return null;
  const fam = t(`fx.lieux.fam.${next.famille}`);
  const nInt = (n: number) => Number(n).toLocaleString(numLocale(locale));
  return (
    <div className="fx-v3">
      <NextDoor
        href={`${basePath}/lieu/${next.slug}`}
        kicker={fill(t("fx.fiche.lieu.next_kicker"), { fam })}
        title={next.name}
        sub={fill(t("fx.fiche.lieu.next_sub"), { rank: `${next.rank}${sufOrdinal(next.rank, locale)}`, total: nInt(next.total), fam })}
        value={next.amount > 0 ? fmtEur(next.amount).v : undefined}
        unit={next.amount > 0 ? fmtEur(next.amount).u : undefined}
      />
    </div>
  );
}
