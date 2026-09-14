import { makeEntityPage } from "@/lib/entity-page";
import { instrumentDetteConfig } from "@/lib/entities/instrument-dette";

const p = makeEntityPage(instrumentDetteConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
