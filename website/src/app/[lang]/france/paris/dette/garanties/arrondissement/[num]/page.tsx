import { makeEntityPage } from "@/lib/entity-page";
import { arrondissementGarantiesConfig } from "@/lib/entities/arrondissement-garanties";

const p = makeEntityPage(arrondissementGarantiesConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
