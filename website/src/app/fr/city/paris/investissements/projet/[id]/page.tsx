import { makeEntityPage } from "@/lib/entity-page";
import { projetConfig } from "@/lib/entities/projet";

const p = makeEntityPage(projetConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
