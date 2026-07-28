/**
 * Rules that are contracts with the UI rather than editorial choices, so they
 * must be identical for every city. ChatPanel parses <followups> and renders
 * the hook blockquote; if a per-city prompt reworded these, the panel would
 * silently stop finding them.
 *
 * Everything city-specific (institutions, currency conventions, which datasets
 * exist, what counts as a trap) lives in the per-scope prompt instead.
 */

type Lang = "fr" | "en";

/** The <followups> block ChatPanel extracts and renders as chips. */
export function followupsProtocol(lang: Lang): string {
  if (lang === "fr") {
    return `# Suggestions de relance (OBLIGATOIRE)
À la toute fin de chaque réponse, ajoute exactement un bloc (invisible côté UI) :
<followups>["Question 1 ?", "Question 2 ?", "Question 3 ?"]</followups>
- 2 à 3 questions courtes, dans la langue de l'utilisateur, répondables avec TES outils.
- JAMAIS de « pourquoi » causal auquel les données ne répondent pas.
- Logiquement liées : creuser un point, comparer une autre année, ouvrir un dataset voisin.
- Ne répète ni la question posée, ni ce qui vient d'être répondu.
- Après un refus (politique/jugement) : des pivots factuels uniquement.`;
  }
  return `# Follow-up suggestions (MANDATORY)
At the very end of every answer, add exactly one block (invisible in the UI):
<followups>["Question 1?", "Question 2?", "Question 3?"]</followups>
- 2 to 3 short questions, in the user's language, answerable with YOUR tools.
- NEVER a causal "why" the data cannot answer.
- Logically connected: dig into a point, compare another year, open an adjacent dataset.
- Do not repeat the question asked, nor what you just answered.
- After a refusal (politics/judgement): factual pivots only.`;
}

/** Layout constraints imposed by the narrow side panel. */
export function formattingProtocol(lang: Lang): string {
  if (lang === "fr") {
    return `- Pas de titres markdown (#, ##) : tes réponses s'affichent dans un panneau étroit — texte, gras et tableaux seulement.
- **Tableaux compacts** : maximum 3 colonnes, montants toujours en DERNIÈRE colonne, en-têtes d'un ou deux mots. Les descriptions longues vont dans le texte, pas dans les cellules.
- Le blockquote (« > ») est réservé à l'accroche chiffrée : jamais ailleurs dans la réponse.`;
  }
  return `- No markdown headings (#, ##): answers render in a narrow panel — text, bold and tables only.
- **Compact tables**: 3 columns maximum, amounts always in the LAST column, one- or two-word headers. Long descriptions belong in the prose, not in cells.
- The blockquote ("> ") is reserved for the opening figure: never anywhere else in the answer.`;
}
