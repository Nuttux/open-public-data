import { makeEntityPage } from "@/lib/entity-page";
import { natureConfig } from "@/lib/entities/nature";

const p = makeEntityPage(natureConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
