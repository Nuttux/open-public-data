export const meta = {
  name: 'write-bmo-recit',
  description: 'Écrit le court récit sourcé « ce que dit l\'archive » à partir des extraits BMO retenus. args = liste de slugs.',
  phases: [
    { title: 'Récit d\'archive', detail: 'un agent résume ce que le Bulletin municipal raconte du lieu' },
  ],
}

// Jeter des citations d'archive brutes sur une fiche, c'est un vidage de données :
// des extraits océrisés de 1926, tronqués, que le lecteur doit interpréter seul.
// Ici un agent écrit 3-5 phrases qui RACONTENT ce que le Bulletin dit du lieu à
// travers les décennies ; les citations restent dessous, dépliables, comme preuve.
// Même grammaire que « Moments clés » pour les délibérations : un récit, chaque
// fait tenu par sa source. Sortie : {slug}_bmo_recit.json
// Invocation : Workflow({ scriptPath:'<ce fichier>', args:['slug-a', ...] })

const CACHE = '/Users/daniel/code/open-public-data/pipeline/cache/lieux'
const SLUGS = Array.isArray(args)
  ? args
  : (typeof args === 'string' && args.trim().startsWith('[') ? JSON.parse(args) : [])

function prompt(slug) {
  return `Tu écris, pour la fiche d'un lieu parisien, un court récit de ce que le Bulletin municipal officiel de la Ville de Paris dit de ce lieu.

Lis ${CACHE}/${slug}_bmo_keep.json (les extraits d'archive RETENUS : {ark, page, issue_date, pourquoi}) et ${CACHE}/${slug}_bmo_snippets.jsonl (le texte verbatim de chaque extrait, repéré par ark+page). Lis aussi ${CACHE}/${slug}_ctx.json pour savoir de quel lieu il s'agit.

Écris un paragraphe de 3 à 5 phrases, en français, qui raconte ce que l'archive donne à voir : quand le lieu apparaît dans le Bulletin, ce qui s'y décide, comment il traverse les décennies. C'est un RÉCIT, pas une liste : le lecteur doit comprendre l'histoire sans lire les citations.

RÈGLES STRICTES :
- N'affirme QUE ce que les extraits disent. Aucun fait, date, montant ou nom qui n'y figure pas. Aucune connaissance extérieure sur le lieu.
- MODALITÉ : « le Conseil approuve le principe » ≠ « c'est fait » ; « autorise à signer » ≠ « signé ». Ne présente jamais un projet voté comme réalisé.
- ATTRIBUTION : ce qu'un élu affirme en séance est un propos, pas un fait — attribue-le ou ne l'écris pas.
- Cite les montants tels quels, avec leur unité d'époque (francs, NF).
- Si les extraits ne couvrent qu'un ou deux épisodes, dis-le sobrement plutôt que de meubler : mieux vaut deux phrases justes que cinq phrases étirées.
- Pas de méta-langage : jamais « les extraits », « le corpus », « la recherche », « ce fichier ». Le lecteur ne sait pas comment c'est fabriqué. Écris « le Bulletin municipal », « l'archive », « le Conseil ».
- Ton neutre et factuel, sans emphase ni adjectif d'admiration.

ÉCRIS ${CACHE}/${slug}_bmo_recit.json : {"slug":"${slug}","recit":"<le paragraphe>","annees":[<année la plus ancienne>,<la plus récente>],"n_extraits":<nombre d'extraits utilisés>}
Réponds en JSON strict : {"slug":"${slug}","n_extraits":N,"note":"une phrase"}`
}

if (!SLUGS.length) {
  log('Aucun slug en args — rien à faire.')
  return { erreur: 'args vide' }
}

phase('Récit d\'archive')
const resultats = await parallel(
  SLUGS.map((slug) => () =>
    agent(prompt(slug), { label: `recit:${slug}`, phase: 'Récit d\'archive' })
      .then((r) => ({ slug, res: String(r).slice(0, 200) }))),
)

const ok = resultats.filter(Boolean)
log(`${ok.length}/${SLUGS.length} récits écrits`)
return { traites: ok.length, details: ok }
