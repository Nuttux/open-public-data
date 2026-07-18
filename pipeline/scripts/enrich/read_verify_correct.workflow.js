export const meta = {
  name: 'read-verify-correct-lieux',
  description: 'Chaîne durcie par lieu : lecture des délibérations → vérif adverse → correction, en une passe. args = liste de slugs.',
  phases: [
    { title: 'Lecture', detail: 'un agent lit les délibérations et écrit l\'enrichissement' },
    { title: 'Vérif+Correction', detail: 'un vérificateur adverse relève les fautes de neutralité, puis un correcteur les applique' },
  ],
}

// Chaîne intégrée « lecture → vérif adverse → correction » — la vérif n'est plus
// un nettoyage après coup mais une étape du pipeline, pour que le passage à
// l'échelle ne publie jamais de paraphrase-IA présentée comme fait.
// Invocation : Workflow({ scriptPath: '<ce fichier>', args: ['slug-a', 'slug-b', ...] })

const CACHE = '/Users/daniel/code/open-public-data/pipeline/cache/lieux'
// args = liste de slugs. Selon le mode de lancement, `args` arrive soit comme
// tableau, soit comme chaîne JSON — on accepte les deux pour ne jamais no-op.
const SLUGS = Array.isArray(args)
  ? args
  : (typeof args === 'string' && args.trim().startsWith('[') ? JSON.parse(args) : [])

const REGLES = `RÈGLES DE NEUTRALITÉ (raison d'être de la vérif) :
- MODALITÉ : « Est approuvé le principe de X » ≠ « X est fait ». « Autorisation à signer » ≠ « signé ». Ne jamais écrire un travail comme réalisé si la source n'approuve qu'un principe/une autorisation.
- ATTRIBUTION : ce qu'un élu affirme en séance est un propos, pas un fait. « dégradé faute d'entretien », « rentable », « la Ville envisageait la destruction » → attribué (« selon Mme X ») ou pas écrit. Jamais dans la voix du narrateur.
- VERBES FACTIFS : « rappeler que », « le fait que » présupposent le vrai — interdits sur tout point contesté.
- INFÉRENCE : aucun mot absent de la source. « participation » ≠ « cofinancement ». Pas de cadrage politique sans ancrage.
- ACTEUR : le Conseil autorise le Maire ; le Maire signe. Ne pas confondre.
- CITATION : une citation exacte peut mentir par troncature — allonger si couper change le sens.
- PREUVE : un document à contexts=[] n'a que son titre pour source ; rester dans ses limites.
- MÉTA-LANGAGE : jamais « ce cache », « le corpus », « le fichier », « n_lus » dans la synthese (publiée telle quelle).`

function promptLecture(slug) {
  return `Tu enrichis la fiche d'un lieu parisien pour un site de transparence. RÈGLE ABSOLUE : aucun fait sans citation vérifiable liée à sa source.

Lis ${CACHE}/${slug}_ctx.json : {slug, phrase, selection_mode, n_lus, docs:[{id, seance, reference, titre, source_url, n_mentions, contexts}]}. Les "contexts" sont des fenêtres autour de chaque mention du lieu dans le texte d'une délibération du Conseil de Paris (artefacts d'encodage Ã©=é, ?=apostrophe → cite VERBATIM malgré tout).

Pour CHAQUE document : ce qu'il dit/décide À PROPOS du lieu ; classe EXACTEMENT parmi "lieu" / "abords" / "mention-liste" / "hors-sujet" ; extrais TOUS les montants liés avec citation verbatim (≤240c) ; "essentiel" (1 phrase) ; "citation_cle" (≤240c) ou null.
Puis "synthese" (3-5 phrases, arc chronologique prouvé) et "moments" (6-8 documents significatifs, MÊLANT LES REGISTRES — gouvernance, travaux, argent, programmation, usages, conflits — pas seulement l'argent ; chaque moment a un "pourquoi" de 5-10 mots qui sert d'accroche).

${REGLES}

Vérifie programmatiquement avant d'écrire : citations = sous-chaînes exactes du bon document ; ids réels. ÉCRIS ${CACHE}/${slug}_enrich.json : {"docs":[{"id","classe","essentiel","montants":[{"montant","objet","citation"}],"citation_cle"}],"synthese","moments":[{"id","seance","fait","pourquoi"}]}
Réponds en JSON strict : {"slug":"${slug}","n_docs":N,"n_lieu":N,"n_moments":N,"note":"une phrase"}`
}

function promptVerifCorrige(slug) {
  return `Contrôle adverse PUIS correction d'un enrichissement d'archives, en une passe. Sois sévère : en cas de doute, corrige.

Compare ${CACHE}/${slug}_enrich.json avec sa source ${CACHE}/${slug}_ctx.json.
1. Vérifie : chaque citation est-elle une sous-chaîne exacte du document de même id ? Chaque id existe-t-il ? Un doc classé "lieu" parle-t-il en réalité des abords/d'un homonyme ? La synthese ou un moment contient-il un jugement, un verbe factif sur un point contesté, un montant de débat présenté comme voté, une modalité inversée (« principe approuvé » → « fait »), du méta-langage pipeline ?

${REGLES}

2. CORRIGE chaque faute trouvée directement dans ${CACHE}/${slug}_enrich.json (reformule le champ fautif ; ne supprime un moment que si irrécupérable, alors remplace-le par un autre document significatif en mêlant les registres). Balaye tout le fichier — les mêmes fautes se répètent souvent ailleurs.
3. Re-vérifie après correction : citations toujours verbatim, ids réels.

Réécris le fichier au même format. Réponds en JSON strict : {"slug":"${slug}","fautes_trouvees":N,"corrigees":N,"types":["..."],"verdict":"ok|corrections","resume":"une phrase"}`
}

if (!SLUGS.length) {
  log('Aucun slug en args — rien à faire.')
  return { erreur: 'args vide' }
}

phase('Lecture')
const resultats = await pipeline(
  SLUGS,
  (slug) => agent(promptLecture(slug), { label: `lit:${slug}`, phase: 'Lecture' }),
  (lecture, slug) => agent(promptVerifCorrige(slug), { label: `verif:${slug}`, phase: 'Vérif+Correction' })
    .then((v) => ({ slug, lecture: String(lecture).slice(0, 200), verif: String(v).slice(0, 300) })),
)

const ok = resultats.filter(Boolean)
log(`${ok.length}/${SLUGS.length} lieux lus + vérifiés + corrigés`)
return { traites: ok.length, details: ok }
