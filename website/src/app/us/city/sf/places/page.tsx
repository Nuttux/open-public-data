import type { Metadata } from "next";
import "@/app/fusion.css";

import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import SfPlacesExplorer from "@/components/us/SfPlacesExplorer";
import EmptyState from "@/components/fusion/EmptyState";
import { loadSfPlacesIndex } from "@/lib/us/sf-places-data";

export const metadata: Metadata = {
  title: "San Francisco — Places",
  description:
    "Parks, libraries, hospitals, piers: for each San Francisco place, the city money that reaches it and the historical documents held at the Internet Archive — every fact linked to its source.",
};

export default async function SfPlacesPage() {
  const places = loadSfPlacesIndex();
  const totalDocs = places.reduce((s, p) => s + p.n_documents, 0);
  const depts = new Set(places.map((p) => p.owning_dept_code)).size;

  return (
    <main id="main-content" tabIndex={-1} style={{ overflowX: "clip" }}>
      <PageIntro
        title={
          <>
            The city, <em>place by place</em>
          </>
        }
        lede="Parks, libraries, hospitals, piers — for each place, the city money that reaches it and the archival record held at the Internet Archive."
        stats={
          <>
            <IntroStat value={places.length} label="places" />
            <IntroStat value={totalDocs} label="archive documents" />
            <IntroStat value={depts} label="city departments" />
          </>
        }
      />

      <section className="fx-section">
        <div className="fx-wrap">
          {places.length > 0 ? (
            <SfPlacesExplorer places={places} />
          ) : (
            <EmptyState
              label="Places"
              title="Places are being prepared"
              body="Each place publishes only with a cleanly-licensed photo, at least three archive documents and a verified money link."
            />
          )}
        </div>
      </section>
    </main>
  );
}
