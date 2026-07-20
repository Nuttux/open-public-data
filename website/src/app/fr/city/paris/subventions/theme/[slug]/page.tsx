import { makeEntityPage } from "@/lib/entity-page";
import { themeConfig } from "@/lib/entities/theme";

const p = makeEntityPage(themeConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
