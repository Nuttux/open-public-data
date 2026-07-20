import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale } from "@/lib/localeContext";
import SfPlaceFiche from "@/components/us/SfPlaceFiche";
import { loadSfPlace } from "@/lib/us/sf-places-data";

type Params = { slug: string };

/**
 * Root-level intercepting drawer for SF place fiches (drawer architecture
 * doctrine: one global drawer per entity, `(...)` at the root — mirrors the
 * SF budget dept drawer). Self-wraps in ForcedLocale because the root @drawer
 * slot renders OUTSIDE app/us/layout.tsx.
 */
export default async function DrawerSfPlacePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const place = loadSfPlace(slug);
  if (!place) return notFound();

  const shareText = `${place.name} — the city money that reaches it and its record in the Internet Archive (San Francisco).`;

  return (
    <ForcedLocale locale="en">
      <div className="theme-fusion">
        <DetailDrawer
          kicker={<>{place.kind} · San Francisco</>}
          title={place.name}
          shareUrl={`/us/city/sf/places/place/${slug}`}
          shareText={shareText}
          backHref="/us/city/sf/places"
          breadcrumbLabel={place.name}
        >
          <SfPlaceFiche place={place} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
