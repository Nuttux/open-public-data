import { describe, expect, it } from "vitest";
import { titleCasePt } from "./format";

describe("titleCasePt", () => {
  it("dé-crie sans casser les sigles", () => {
    expect(titleCasePt("BANCO DO BRASIL S/A")).toBe("Banco do Brasil S/A");
    expect(titleCasePt("P.R.M. SERVIÇOS E MÃO DE OBRA ESPECIALIZADA EIRELI")).toBe(
      "P.R.M. Serviços e Mão de Obra Especializada EIRELI",
    );
    expect(titleCasePt("ABILIO GOMES")).toBe("Abilio Gomes");
    expect(titleCasePt("CAIXA ECONOMICA FEDERAL")).toBe("Caixa Economica Federal");
    expect(titleCasePt("SOCIEDADE PERNAMBUCANA DE COMBATE AO CANCER")).toBe(
      "Sociedade Pernambucana de Combate ao Cancer",
    );
  });
  it("capitalise après une parenthèse", () => {
    expect(titleCasePt("FORNECIMENTO DE REFEIÇÕES (PREPARO, COCÇÃO)")).toBe(
      "Fornecimento de Refeições (Preparo, Cocção)",
    );
  });
  it("laisse la casse mixte tranquille", () => {
    expect(titleCasePt("Prefeitura do Recife")).toBe("Prefeitura do Recife");
  });
});
