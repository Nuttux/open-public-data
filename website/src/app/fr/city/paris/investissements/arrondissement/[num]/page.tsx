import { makeEntityPage } from "@/lib/entity-page";
import { arrondissementInvestConfig } from "@/lib/entities/arrondissement-invest";

const p = makeEntityPage(arrondissementInvestConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
