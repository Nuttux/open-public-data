import { makeEntityPage } from "@/lib/entity-page";
import { chapitreConfig } from "@/lib/entities/chapitre";

const p = makeEntityPage(chapitreConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
