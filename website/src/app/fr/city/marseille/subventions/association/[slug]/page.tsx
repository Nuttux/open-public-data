import { makeEntityPage } from "@/lib/entity-page";
import { makeAssociationConfig } from "@/lib/entities/association";

// Marseille beneficiary fiche — same entity page as Paris, city-parametrized.
const p = makeEntityPage(makeAssociationConfig("marseille"));
export const generateMetadata = p.generateMetadata;
export default p.Page;
