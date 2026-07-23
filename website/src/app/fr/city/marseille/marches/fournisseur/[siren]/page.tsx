import { makeEntityPage } from "@/lib/entity-page";
import { makeFournisseurConfig } from "@/lib/entities/fournisseur";

// Marseille supplier fiche — same entity page as Paris, city-parametrized.
const p = makeEntityPage(makeFournisseurConfig("marseille"));
export const generateMetadata = p.generateMetadata;
export default p.Page;
