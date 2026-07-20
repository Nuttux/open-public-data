import { makeEntityPage } from "@/lib/entity-page";
import { associationConfig } from "@/lib/entities/association";

const p = makeEntityPage(associationConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
