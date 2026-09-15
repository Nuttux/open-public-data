import { describe, expect, it } from "vitest";
import { dedupMixedSources } from "./marches-dedup";

const ville = (numero: string, objet: string, montant: number, date = "2024-03-12") => ({ numero_marche: numero, objet, montant_max: montant, date_notification: date, _source_origin: "paris" });
const decp = (numero: string, objet: string, montant: number, date = "2024-03-12") => ({ numero_marche: numero, objet, montant_max: montant, date_notification: date, _source_origin: "decp" });

describe("dedupMixedSources", () => {
  it("drops the DECP twin of a City row: same amount, same day, a word in common", () => {
    const r = dedupMixedSources([
      ville("20242024T00109", "SA3_ACMS TRAVAUX AMENAGEMENT COURS OASIS 18È 19È 20È_LOT 1", 60e6),
      decp("decp-2024T00118", "Accord-cadre pour les travaux d'aménagement paysager des cours des établissements parisiens", 60e6),
    ]);
    expect(r.rows.map((x) => x.numero_marche)).toEqual(["20242024T00109"]);
    expect(r.dropped).toBe(1);
    expect(r.droppedAmount).toBe(60e6);
  });
  it("pairs one for one: three City lots absorb three DECP rows, not four", () => {
    const r = dedupMixedSources([
      ville("A1", "COURS OASIS LOT 1", 60e6), ville("A2", "COURS OASIS LOT 2", 60e6), ville("A3", "COURS OASIS LOT 3", 60e6),
      decp("d1", "travaux des cours", 60e6), decp("d2", "travaux des cours", 60e6), decp("d3", "travaux des cours", 60e6), decp("d4", "travaux des cours", 60e6),
    ]);
    expect(r.rows).toHaveLength(4);
    expect(r.dropped).toBe(3);
  });
  it("keeps a DECP row when the day, the amount or the words differ", () => {
    const r = dedupMixedSources([
      ville("A", "FOURNITURE DE CARBURANT", 50e6, "2024-05-02"),
      decp("d-day", "Fourniture de carburant", 50e6, "2024-05-03"),
      decp("d-amt", "Fourniture de carburant", 49e6, "2024-05-02"),
      decp("d-words", "Entretien des chaudières", 50e6, "2024-05-02"),
    ]);
    expect(r.rows).toHaveLength(4);
    expect(r.dropped).toBe(0);
  });
  it("leaves single-source years untouched", () => {
    const only = [decp("d1", "x", 1e6), decp("d2", "x", 1e6)];
    expect(dedupMixedSources(only).rows).toBe(only);
    const list = [ville("a", "x", 1e6)];
    expect(dedupMixedSources(list).rows).toBe(list);
  });
  it("ignores small DECP rows", () => {
    const r = dedupMixedSources([ville("A", "petit achat", 50_000), decp("d", "petit achat", 50_000)]);
    expect(r.rows).toHaveLength(2);
  });
});
