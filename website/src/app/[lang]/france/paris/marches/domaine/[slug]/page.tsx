import { makeEntityPage } from "@/lib/entity-page";
import { domaineConfig } from "@/lib/entities/domaine";

const p = makeEntityPage(domaineConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
