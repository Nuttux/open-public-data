import { makeRecifeRecipientsBrowse } from "@/components/browse/browse-pages";

// Browse index (lib/seo/browse.ts): plain, paged links so a crawler reaches
// every fiche in three clicks — footer → index → letter/year → page.
export const dynamic = "force-dynamic";

const p = makeRecifeRecipientsBrowse();
export const generateMetadata = p.generateMetadata;
export default p.Page;
