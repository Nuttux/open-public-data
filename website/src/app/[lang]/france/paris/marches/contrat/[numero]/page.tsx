import { makeEntityPage } from "@/lib/entity-page";
import { contratConfig } from "@/lib/entities/contrat";

const p = makeEntityPage(contratConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
