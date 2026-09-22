import type { Metadata } from "next";
import { NextDoor } from "@/components/fiche/Doors";
import SectionHero from "@/components/fiche/SectionHero";
import { brlMagnitude, fmtBrlCompactNum, titleCasePt } from "@/lib/br/format";
import Link from "@/components/LocalizedLink";
import { notFound } from "next/navigation";
import { loadContrato } from "@/lib/br/recife-data";
import RecifeContratoFiche from "@/components/br/RecifeContratoFiche";
import { answerMetadata } from "@/lib/seo/page-answer";
import { contratoAnswer } from "@/lib/br/recife-answers";
import { recifeLocale } from "@/lib/br/recife-locale";
import PageJsonLd from "@/components/seo/PageJsonLd";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { contratoRelated } from "@/lib/br/recife-related";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const found = loadContrato(id);
  if (!found) return { title: { absolute: "Recife" } };
  const locale = await recifeLocale();
  return answerMetadata(contratoAnswer(found.contrato, found.source, locale), `/brasil/recife/contratos/${id}`, locale);
}


/** Le titre d'une fiche contrat : son objet, dé-crié et coupé à la phrase, et
 *  le numéro seulement quand l'objet manque. Les objets du portail font parfois
 *  trois lignes de majuscules : un titre de page n'en veut que la tête. */
function objetoTitre(objeto: string | null | undefined, numero: string | null | undefined, locale: string): string {
  const o = titleCasePt(objeto ?? "").trim().replace(/\s*[-–—]\s*lotes?\b.*$/i, "").replace(/\.$/, "");
  if (o.length >= 12) return o.length > 58 ? `${o.slice(0, 58).replace(/\s+\S*$/, "")}…` : o;
  const n = numero ?? (locale === "en" ? "no number" : "sem número");
  return `${locale === "en" ? "Contract" : "Contrato"} ${n}`;
}

export default async function ContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await recifeLocale();
  const { id } = await params;
  const found = loadContrato(id);
  if (!found) notFound();
  const en = locale === "en";
  const answer = contratoAnswer(found.contrato, found.source, locale);
  const valor = found.contrato.valor ?? 0;
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links">
          <Link href="/brasil/recife">Recife</Link> › <Link href="/brasil/recife/contratos">{en ? "Contracts" : "Contratos"}</Link>
          {found.contrato.numero ? ` · ${found.contrato.numero}` : ""}
        </div>
        <div className="fx-sec-grid" data-layout="subventions">
          <div className="fx-sec-a-hero">
            {/* Le contrat porte ce qu'il achète, pas sa référence (2026-09-18) :
                Paris nomme ses marchés par leur objet, le numéro reste en surtitre. */}
            <SectionHero
              title={objetoTitre(found.contrato.objeto, found.contrato.numero, locale)}
              value={fmtBrlCompactNum(valor)}
              unit={brlMagnitude(valor)}
              captionBefore={en ? "the contract's value" : "de valor do contrato"}
              years={[]}
              year={0}
              basePath={`/brasil/recife/contratos/${id}`}
              meta={answer.answer}
              shareTitle={answer.title}
            />
            <PageJsonLd title={answer.title} description={answer.answer} path={`/brasil/recife/contratos/${id}`} locale={locale} creator="Prefeitura do Recife" spatialCoverage="Recife, Pernambuco" />
          </div>
          <div className="fx-sec-a-scene">
            <div className="fx-fiche fx-fiche-shell">
              <RecifeContratoFiche c={found.contrato} source={found.source} headlineInHero />
            </div>
          </div>
          <div className="fx-sec-a-related">
            <RelatedLinks block={contratoRelated(found.contrato, locale)} />
          </div>
          <div className="fx-sec-a-next">
            <NextDoor
              href="/brasil/recife/contratos"
              kicker={en ? "Contracts" : "Contratos"}
              title={en ? "Every contract in the register" : "Todos os contratos do registro"}
              sub={en ? "By procurement route, by amount, by body." : "Por modalidade, por valor, por órgão."}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
