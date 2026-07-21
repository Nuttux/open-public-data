export const meta = {
  name: 'translate-lieux-en',
  description: 'Traduit en anglais le contenu narratif d\'un lieu (synthèse, moments, extrait Wikipédia, note exploitant) : écrit {slug}_en.json, fusionné par export_lieux.py. args = liste de slugs.',
  phases: [
    { title: 'Traduction', detail: 'un agent traduit fidèlement chaque champ narratif, sans reformuler le sens' },
  ],
}

// Convention posée par ede8677c (traduction lieux 2026-07-20) : le FR reste la
// seule vérité pour l'ordre et le contenu, l'EN n'est qu'un double _en à côté
// de chaque champ traduisible. Fichier optionnel — sans lui, apply_en_translations
// (export_lieux.py) replie sur le FR pour ce lieu, comme n'importe quel champ
// _en absent ailleurs sur le site.
// Invocation : Workflow({ scriptPath: '<ce fichier>', args: ['slug-a', ...] })

const CACHE = '/Users/daniel/code/open-public-data/pipeline/cache/lieux'
const SLUGS = Array.isArray(args)
  ? args
  : (typeof args === 'string' && args.trim().startsWith('[') ? JSON.parse(args) : [])

function promptTraduis(slug) {
  return `Tu traduis en anglais le contenu d'une fiche de transparence civique (lieu parisien), pour le site France Open Data. RÈGLE ABSOLUE : traduction FIDÈLE, jamais de reformulation, d'ajout ou de perte de nuance — un vœu d'élu contesté reste un vœu contesté, une modalité (« autorisé » vs « fait ») ne change pas de sens en anglais. Registre neutre, factuel, journalistique (pas de ton promotionnel).

Lis ces fichiers s'ils existent (ignore ceux absents) :
- ${CACHE}/${slug}_enrich.json → {synthese, moments:[{id, fait, pourquoi}]}
- ${CACHE}/wiki_summaries.json → objet {${slug}: {extract}} (peut être absent pour ce slug)
- ${CACHE}/${slug}_money_resolved.json → exploitant.note_publique (si présent), residents:[{beneficiaire, preuve}]
- ${CACHE}/${slug}_bmo_recit.json → {recit} (si présent)
- ${CACHE}/${slug}_bmo_snippets.jsonl et ${CACHE}/${slug}_bmo_keep.json → extraits BMO retenus (si présents ; extrait_en clé par "date|page_url" — lis page_url dans les extraits gardés)

Traduis UNIQUEMENT les champs suivants s'ils existent et sont non vides. Note : un même "id" de moment peut apparaître plusieurs fois dans "moments" (plusieurs faits distincts sur la même délibération) — fournis alors une LISTE de traductions sous cet id, une par occurrence dans l'ordre d'apparition ; sinon un objet simple.

Écris ${CACHE}/${slug}_en.json au format EXACT :
{
  "synthese_en": "..." ou omis si enrich.synthese absent,
  "wiki_extract_en": "..." ou omis si pas d'extrait wiki pour ce slug,
  "bmo_recit_en": "..." ou omis si pas de récit BMO,
  "note_publique_en": "..." ou omis si pas de note_publique exploitant,
  "moments_en": {"<id>": {"fait_en":"...", "pourquoi_en":"..."}, ...} (ou {"<id>": [ {...}, {...} ]} si id répété),
  "bmo_extraits_en": {"<date>|<page_url>": "..."} ou omis si pas d'extraits BMO,
  "residents_en": {"<beneficiaire>": "..."} ou omis si pas de résidents
}

Réponds en JSON strict : {"slug":"${slug}","traduit":["synthese_en","moments_en",...],"note":"une phrase"}`
}

if (!SLUGS.length) {
  log('Aucun slug en args — rien à faire.')
  return { erreur: 'args vide' }
}

phase('Traduction')
const resultats = await pipeline(
  SLUGS,
  (slug) => agent(promptTraduis(slug), { label: `traduit:${slug}`, phase: 'Traduction' })
    .then((r) => ({ slug, r: String(r).slice(0, 200) })),
)

const ok = resultats.filter(Boolean)
log(`${ok.length}/${SLUGS.length} lieux traduits en anglais`)
return { traites: ok.length, details: ok }
