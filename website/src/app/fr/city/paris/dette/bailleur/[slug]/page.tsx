import { makeEntityPage } from "@/lib/entity-page";
import { bailleurConfig } from "@/lib/entities/bailleur";

const p = makeEntityPage(bailleurConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
