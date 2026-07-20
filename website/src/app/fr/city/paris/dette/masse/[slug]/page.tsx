import { makeEntityPage } from "@/lib/entity-page";
import { masseConfig } from "@/lib/entities/masse";

const p = makeEntityPage(masseConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
