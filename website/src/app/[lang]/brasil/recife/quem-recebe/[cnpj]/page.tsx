import type { Metadata } from "next";
import { NextDoor } from "@/components/fiche/Doors";
import SectionHero from "@/components/fiche/SectionHero";
import { brlMagnitude, fmtBrlCompactNum, titleCasePt } from "@/lib/br/format";
import Link from "@/components/LocalizedLink";
import { notFound } from "next/navigation";
import { loadRecipient } from "@/lib/br/recife-data";
import RecifeRecebedorFiche from "@/components/br/RecifeRecebedorFiche";
import { answerMetadata } from "@/lib/seo/page-answer";
import { recipientAnswer } from "@/lib/br/recife-answers";
import { recifeLocale } from "@/lib/br/recife-locale";
import PageJsonLd from "@/components/seo/PageJsonLd";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { recipientRelated } from "@/lib/br/recife-related";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cnpj: string }>;
}): Promise<Metadata> {
  const { cnpj } = await params;
  const rec = loadRecipient(cnpj);
  if (!rec) return { title: { absolute: "Recife" } };
  const locale = await recifeLocale();
  return answerMetadata(recipientAnswer(rec, locale), `/brasil/recife/quem-recebe/${cnpj}`, locale);
}

export default async function RecebedorPage({ params }: { params: Promise<{ cnpj: string }> }) {
  const locale = await recifeLocale();
  const { cnpj } = await params;
  const rec = loadRecipient(cnpj);
  if (!rec) notFound();
  const { source, ...detail } = rec;
  const en = locale === "en";
  const total = rec.total_pago > 0 ? rec.total_pago : (rec.total_contratado ?? 0);
  const answer = recipientAnswer(rec, locale);
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links">
          <Link href="/brasil/recife">Recife</Link> › <Link href="/brasil/recife/quem-recebe">{en ? "Who is paid" : "Quem recebe"}</Link>
        </div>
        <div className="fx-sec-grid" data-layout="subventions">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={titleCasePt(rec.nome)}
              value={fmtBrlCompactNum(total)}
              unit={brlMagnitude(total)}
              captionBefore={en ? "received from the city" : "recebidos da Prefeitura"}
              years={[]}
              year={0}
              basePath={`/brasil/recife/quem-recebe/${cnpj}`}
              meta={answer.answer}
              shareTitle={answer.title}
            />
            <PageJsonLd title={answer.title} description={answer.answer} path={`/brasil/recife/quem-recebe/${cnpj}`} locale={locale} creator="Prefeitura do Recife" spatialCoverage="Recife, Pernambuco" />
          </div>
          <div className="fx-sec-a-scene">
            <div className="fx-fiche fx-fiche-shell">
              <RecifeRecebedorFiche rec={detail} source={source} headlineInHero />
            </div>
          </div>
          <div className="fx-sec-a-related">
            <RelatedLinks block={recipientRelated(rec, locale)} />
          </div>
          <div className="fx-sec-a-next">
            <NextDoor
              href="/brasil/recife/quem-recebe"
              kicker={en ? "Who is paid" : "Quem recebe"}
              title={en ? "Everyone the city pays" : "Todos os que recebem da Prefeitura"}
              sub={en ? "4,866 organisations, by theme and by amount." : "4.866 organizações, por tema e por valor."}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
