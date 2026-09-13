import { makeEntityPage } from "@/lib/entity-page";
import { makeThemeConfig } from "@/lib/entities/theme";

// Marseille subventions theme fiche — same entity page as Paris, city-parametrized.
const p = makeEntityPage(makeThemeConfig("marseille"));
export const generateMetadata = p.generateMetadata;
export default p.Page;
