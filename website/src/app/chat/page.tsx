import type { Metadata } from "next";
import ChatExamples from "./ChatExamples";

export const metadata: Metadata = {
  title: "Pose tes questions au budget de Paris",
  description:
    "Un assistant IA qui répond à tes questions sur les finances de la Ville de Paris à partir des données publiques. Subventions, marchés, dette, budget — sources citées, neutralité éditoriale.",
  alternates: { canonical: "/chat" },
  openGraph: {
    title: "Chat avec les données publiques de Paris",
    description:
      "Pose une question. L'assistant répond à partir des données ouvertes de la Ville (budget, subventions, marchés, dette) — sources citées.",
    type: "website",
  },
};

const POINTS = [
  {
    title: "Sources publiques uniquement",
    body: "Subventions, marchés publics, budget, dette — tout vient des données ouvertes de la Ville et des comptes administratifs. Aucun chiffre inventé.",
  },
  {
    title: "Neutralité éditoriale",
    body: "Pas de cadrage politique, pas de jugement sur les prestataires, pas d'extrapolation. L'assistant cite l'année et le dataset à chaque chiffre.",
  },
  {
    title: "Transparence totale",
    body: "Tu vois quels outils l'assistant interroge en temps réel. Pas de boîte noire.",
  },
];

export default function ChatLanding() {
  return (
    <main className="min-h-screen bg-[#fafaf7]">
      <section className="mx-auto max-w-4xl px-5 pt-16 pb-20 md:pt-24">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-neutral-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#e11d1d]" />
          Nouveau · Assistant IA
        </div>
        <h1 className="mt-2 text-4xl font-bold leading-tight tracking-tight text-neutral-900 md:text-6xl">
          Pose tes questions au <span className="text-[#2a3680] italic">budget de Paris</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-neutral-700">
          Un assistant qui répond à partir des données publiques de la Ville — subventions, marchés, dette, budget. Sources citées, ton neutre, chiffres issus des seules données ouvertes.
        </p>

        <div className="mt-10">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Exemples de questions
          </div>
          <ChatExamples />
          <p className="mt-3 text-xs text-neutral-500">
            Cliquer ouvre le chat avec la question pré-remplie.
          </p>
        </div>
      </section>

      <section className="border-t border-neutral-200 bg-white">
        <div className="mx-auto grid max-w-4xl gap-8 px-5 py-14 md:grid-cols-3">
          {POINTS.map((p) => (
            <div key={p.title}>
              <div className="text-base font-semibold text-neutral-900">{p.title}</div>
              <p className="mt-2 text-sm text-neutral-600">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-14">
        <h2 className="text-2xl font-bold text-neutral-900">Comment ça marche ?</h2>
        <ol className="mt-5 space-y-4 text-sm text-neutral-700">
          <li>
            <span className="font-semibold text-neutral-900">1. Tu poses une question</span> — en langage naturel, sans jargon nécessaire.
          </li>
          <li>
            <span className="font-semibold text-neutral-900">2. L'assistant interroge les datasets</span> — tu vois en direct quels outils il utilise (subventions, marchés, budget, dette).
          </li>
          <li>
            <span className="font-semibold text-neutral-900">3. Tu reçois une réponse sourcée</span> — chiffres précis, dataset cité, ordre de grandeur, sans extrapolation.
          </li>
          <li>
            <span className="font-semibold text-neutral-900">4. Tu peux partager</span> — chaque réponse est partageable via lien permanent avec aperçu auto-généré.
          </li>
        </ol>

        <div className="mt-10 rounded-xl border border-neutral-200 bg-neutral-50 p-6">
          <div className="text-sm font-semibold text-neutral-900">Limites à connaître</div>
          <ul className="mt-2 space-y-1.5 text-xs text-neutral-600">
            <li>• Les données 2025-2026 sont budgétaires (votées), pas exécutées.</li>
            <li>• Les marchés publics affichent des enveloppes pluriannuelles, pas des dépenses annuelles réelles.</li>
            <li>• Le nombre de subventions par année n'est pas toujours comparable d'une année à l'autre (les montants, si).</li>
            <li>• L'assistant ne fait pas d'analyse politique ni de jugement sur les bénéficiaires.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
