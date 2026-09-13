import { makeFournisseursBrowse } from "@/components/browse/browse-pages";

// Browse index (lib/seo/browse.ts): plain, paged links so a crawler reaches
// every fiche in three clicks — footer → index → letter/year → page.
export const dynamic = "force-dynamic";

const p = makeFournisseursBrowse("paris");
export const generateMetadata = p.generateMetadata;
export default p.Page;
