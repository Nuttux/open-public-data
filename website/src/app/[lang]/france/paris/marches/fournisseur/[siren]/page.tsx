import { makeEntityPage } from "@/lib/entity-page";
import { fournisseurConfig } from "@/lib/entities/fournisseur";

const p = makeEntityPage(fournisseurConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
