import { makeEntityPage } from "@/lib/entity-page";
import { lieuConfig } from "@/lib/entities/lieu";

export { lieuStaticParams as generateStaticParams } from "@/lib/entities/lieu";

const p = makeEntityPage(lieuConfig);
export const generateMetadata = p.generateMetadata;
export default p.Page;
