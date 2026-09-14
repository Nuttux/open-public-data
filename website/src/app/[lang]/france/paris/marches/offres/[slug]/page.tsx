import { makeEntityPage } from "@/lib/entity-page";
import { offresConfig } from "@/lib/entities/offres";

const p = makeEntityPage(offresConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
