"use client";

import { askChat } from "@/lib/chat/suggestions";
import { useLocale } from "@/lib/localeContext";

// Cartes d'exemples de la page /chat. Boutons (pas des liens ?q=) : le
// ChatPanel est monté globalement et ne relit pas ?q= lors d'une navigation
// client — l'événement interne ouvre le panneau et envoie la question.
// Questions localisées : le modèle répond dans la langue de la question.
const EXAMPLES: Record<"fr" | "en", { q: string; tag: string }[]> = {
  fr: [
    { q: "Combien coûte le ramassage des ordures à Paris ?", tag: "Vie quotidienne" },
    { q: "Ça fait combien de dette par Parisien ?", tag: "Dette" },
    { q: "Qui sont les 5 plus gros bénéficiaires de subventions en 2024 ?", tag: "Subventions" },
    { q: "Combien Paris dépense-t-elle en cabinets de conseil ?", tag: "Marchés" },
    { q: "Combien la Ville soutient-elle Paris Habitat au total ?", tag: "Croisement" },
    { q: "Paris dépense-t-elle plus que ce qu'elle vote au budget ?", tag: "Voté vs réel" },
  ],
  en: [
    { q: "How much does garbage collection cost in Paris?", tag: "Everyday life" },
    { q: "How much city debt is that per Parisian?", tag: "Debt" },
    { q: "Who are the 5 biggest subsidy recipients in 2024?", tag: "Subsidies" },
    { q: "How much does Paris spend on consulting firms?", tag: "Contracts" },
    { q: "How much does the City support Paris Habitat in total?", tag: "Cross-view" },
    { q: "Does Paris spend more than it votes in the budget?", tag: "Voted vs actual" },
  ],
};

export default function ChatExamples() {
  const { locale } = useLocale();
  const examples = EXAMPLES[locale === "en" ? "en" : "fr"];
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {examples.map((ex) => (
        <button
          key={ex.q}
          onClick={() => askChat(ex.q)}
          className="group flex items-start justify-between gap-3 rounded-lg border! border-solid! border-neutral-200! bg-white! px-4 py-3 text-left transition hover:border-[#2a3680]! hover:shadow-sm"
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#2a3680]">
              {ex.tag}
            </div>
            <div className="mt-0.5 text-sm text-neutral-800 group-hover:text-[#2a3680] transition">
              {ex.q}
            </div>
          </div>
          <span className="mt-3 text-neutral-300 group-hover:text-[#2a3680] transition">→</span>
        </button>
      ))}
    </div>
  );
}
