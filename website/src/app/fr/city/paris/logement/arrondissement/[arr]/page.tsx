import { makeEntityPage } from "@/lib/entity-page";
import { logementArrondissementConfig } from "@/lib/entities/logement-arrondissement";

const p = makeEntityPage(logementArrondissementConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
