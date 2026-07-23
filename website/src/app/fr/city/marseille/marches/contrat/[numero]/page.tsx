import { makeEntityPage } from "@/lib/entity-page";
import { makeContratConfig } from "@/lib/entities/contrat";

// Marseille contract fiche — same entity page as Paris, city-parametrized.
const p = makeEntityPage(makeContratConfig("marseille"));
export const generateMetadata = p.generateMetadata;
export default p.Page;
