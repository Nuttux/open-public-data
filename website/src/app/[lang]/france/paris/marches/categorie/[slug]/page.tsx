import { makeEntityPage } from "@/lib/entity-page";
import { categorieConfig } from "@/lib/entities/categorie";

const p = makeEntityPage(categorieConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
