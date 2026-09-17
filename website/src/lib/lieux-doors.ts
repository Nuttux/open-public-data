/**
 * The doors of the Lieux section (« Voir aussi », the next section), the same
 * shape for every city (2026-09-18) : an address, the i18n keys of a title
 * and a sub-line with their variables, and a figure in the city's currency.
 * Built on the server from each city's loaders, worded on the client.
 *
 * No fs import here : the France pages and the client both import it.
 */
export type LieuxDoor = {
  href: string;
  /** i18n keys ; `vars` fills the sub-line. */
  title: string;
  sub: string;
  vars?: Record<string, string | number>;
  amount?: number | null;
};

export type LieuxDoors = {
  related: LieuxDoor[];
  next: LieuxDoor | null;
};

/** Paris and Marseille : investments and grants of the latest year, the budget next. */
export function frLieuxDoors(
  hub: string,
  d: {
    invest?: { year: number; total: number } | null;
    subventions?: { year: number; total: number; count: number } | null;
    next?: { year: number; total: number; voted: boolean } | null;
  },
): LieuxDoors {
  return {
    related: [
      d.invest
        ? { href: `${hub}/investissements?year=${d.invest.year}`, title: "fx.sec.lieux.r.invest", sub: "fx.sec.lieux.r.invest_sub", vars: { year: d.invest.year }, amount: d.invest.total }
        : { href: `${hub}/investissements`, title: "fx.sec.lieux.r.invest", sub: "fx.sec.lieux.r.invest_sub_noyear" },
      d.subventions
        ? { href: `${hub}/subventions?year=${d.subventions.year}`, title: "fx.sec.lieux.r.subv", sub: "fx.sec.lieux.r.subv_sub", vars: { n: d.subventions.count, year: d.subventions.year }, amount: d.subventions.total }
        : { href: `${hub}/subventions`, title: "fx.sec.lieux.r.subv", sub: "fx.sec.lieux.r.subv_sub_noyear" },
    ],
    next: d.next
      ? { href: `${hub}/budget?year=${d.next.year}`, title: "fx.sec.lieux.next", sub: d.next.voted ? "fx.sec.lieux.next_sub_vote" : "fx.sec.lieux.next_sub_n", vars: { year: d.next.year }, amount: d.next.total }
      : { href: `${hub}/budget`, title: "fx.sec.lieux.next", sub: "fx.sec.lieux.next_sub" },
  };
}
