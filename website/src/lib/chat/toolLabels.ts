// Libellés humains des appels d'outils, affichés pendant le chargement.
// Le nom technique reste accessible en title/tooltip — sur scène et pour le
// grand public, « je fouille les marchés ("ordures") » raconte l'attente.
// Deux dictionnaires (fr/en) : le libellé suit la locale de l'interface,
// comme le reste du panneau.

type ToolInput = Record<string, unknown>;

export function toolLabel(name: string, input: ToolInput, locale: "fr" | "en" = "fr"): string {
  const year = input.year != null ? ` ${input.year}` : "";
  const q = typeof input.query === "string" && input.query ? ` (« ${input.query} »)` : "";
  const qEn = typeof input.query === "string" && input.query ? ` ("${input.query}")` : "";
  const theme = typeof input.thematique === "string" && input.thematique ? ` — ${input.thematique}` : "";
  const nature = typeof input.nature === "string" && input.nature ? ` « ${input.nature} »` : "";
  const natureEn = typeof input.nature === "string" && input.nature ? ` "${input.nature}"` : "";

  if (locale === "en") {
    switch (name) {
      case "list_datasets":
        return "listing the available datasets";
      case "get_subventions_summary":
        return `checking${year} subsidies${theme} (top recipients)`;
      case "get_subventions_tendances":
        return year ? `breaking down${year} subsidies by theme` : "pulling the subsidies series over the years";
      case "search_beneficiaire":
        return `searching subsidy recipients${qEn}`;
      case "get_marches_summary":
        return `checking${year} public contracts`;
      case "search_marches":
        return `digging through public contracts${qEn}`;
      case "get_marches_tendances":
        return "pulling the public-contracts trend";
      case "get_budget_sankey":
        return `checking${year} budget flows`;
      case "get_budget_nature":
        return natureEn ? `breaking down${natureEn}${year} spending by sector` : `checking the${year} budget by type of spending`;
      case "get_evolution_budget":
        return year ? `detailing the${year} budget` : "pulling the budget trend";
      case "get_vote_vs_execute":
        return `comparing voted vs executed budget${year}`;
      case "get_investissements":
        return year ? `checking${year} investments` : "pulling the investment series";
      case "get_dette_structure":
        return year ? `detailing${year} debt (instruments, issuances)` : "pulling the debt trend";
      case "get_bilan":
        return year ? `checking the${year} balance sheet` : "pulling the balance-sheet series";
      case "get_hors_bilan":
        return year ? `checking${year} loan guarantees` : "pulling the guarantees series";
      case "get_logement_social":
        return "checking social-housing demand";
      default:
        return name;
    }
  }

  switch (name) {
    case "list_datasets":
      return "j'inventorie les datasets disponibles";
    case "get_subventions_summary":
      return `je regarde les subventions${year}${theme} (top bénéficiaires)`;
    case "get_subventions_tendances":
      return year ? `je ventile les subventions${year} par thématique` : "je remonte la série des subventions";
    case "search_beneficiaire":
      return `je cherche${q} dans les bénéficiaires de subventions`;
    case "get_marches_summary":
      return `je regarde les marchés publics${year}`;
    case "search_marches":
      return `je fouille les marchés publics${q}`;
    case "get_marches_tendances":
      return "je remonte l'évolution des marchés publics";
    case "get_budget_sankey":
      return `je regarde les flux budgétaires${year}`;
    case "get_budget_nature":
      return nature ? `je ventile les dépenses${nature}${year} par secteur` : `je regarde le budget${year} par nature de dépense`;
    case "get_evolution_budget":
      return year ? `je détaille le budget${year}` : "je remonte l'évolution du budget";
    case "get_vote_vs_execute":
      return `je compare budget voté et exécuté${year}`;
    case "get_investissements":
      return year ? `je regarde les investissements${year}` : "je remonte la série des investissements";
    case "get_dette_structure":
      return year ? `je détaille la dette${year} (instruments, émissions)` : "je remonte l'évolution de la dette";
    case "get_bilan":
      return year ? `je regarde le bilan comptable${year}` : "je remonte la série du bilan";
    case "get_hors_bilan":
      return year ? `je regarde les garanties d'emprunt${year}` : "je remonte la série des garanties";
    case "get_logement_social":
      return "je regarde la demande de logement social";
    default:
      return name;
  }
}

export function toolRaw(name: string, input: ToolInput): string {
  return `${name}(${JSON.stringify(input)})`;
}
