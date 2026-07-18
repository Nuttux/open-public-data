import { notFound } from "next/navigation";

import { DetailDrawer } from "@/components/fusion";
import LieuFiche from "@/components/fusion/LieuFiche";
import { loadLieu } from "@/lib/lieux-data";

type Params = { slug: string };

export default async function DrawerLieuPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const lieu = loadLieu(slug);
  if (!lieu) return notFound();

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={`${lieu.kind_fr} · ${lieu.arrondissement}${lieu.arrondissement === 1 ? "er" : "e"}`}
        title={lieu.name}
        shareUrl={`/fr/city/paris/lieu/${lieu.slug}`}
        backHref="/fr/city/paris/lieux"
        breadcrumbLabel={lieu.name}
      >
        <LieuFiche lieu={lieu} />
      </DetailDrawer>
    </div>
  );
}
