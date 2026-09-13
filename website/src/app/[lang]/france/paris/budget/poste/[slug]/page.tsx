import { makeEntityPage } from "@/lib/entity-page";
import { posteConfig } from "@/lib/entities/poste";

const p = makeEntityPage(posteConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
