export const meta = {
  name: 'rank-moments-lieux',
  description: 'Juge la SAILLANCE de chaque moment clé d\'un lieu : marque les 3-6 plus marquants, le reste replié. Écrit {slug}_saillance.json. args = liste de slugs.',
  phases: [
    { title: 'Saillance', detail: 'un agent classe les moments par importance historique' },
  ],
}

// Les moments d'un lieu sont écrits dans l'ordre CHRONOLOGIQUE — donc la fiche
// mettait en avant les plus ANCIENS, pas les plus importants. Ce pass juge, pour
// chaque lieu, quels moments sont réellement marquants (fondation, grande
// rénovation, crise de gouvernance, gros montant, conflit, changement d'usage) :
// il en retient 3 à 6 selon la richesse du lieu, le reste étant replié.
// N'ÉCRIT PAS dans _enrich.json (vérifié) : sort un {slug}_saillance.json que
// l'export fusionne — les faits restent intouchés.
// Invocation : Workflow({ scriptPath:'<ce fichier>', args:['slug-a', ...] })

const CACHE = '/Users/daniel/code/open-public-data/pipeline/cache/lieux'
const SLUGS = Array.isArray(args)
  ? args
  : (typeof args === 'string' && args.trim().startsWith('[') ? JSON.parse(args) : [])

function promptRank(slug) {
  return `Tu hiérarchises les « moments clés » d'un lieu parisien pour sa fiche de transparence. But : mettre en avant les moments les PLUS MARQUANTS de son histoire, pas les plus anciens.

Lis ${CACHE}/${slug}_enrich.json : {synthese, moments:[{id, seance, fait, pourquoi}]}. Chaque moment est une décision du Conseil de Paris déjà vérifiée.

Choisis les moments À METTRE EN AVANT (« forte » saillance) — ceux qu'un visiteur curieux doit voir en premier :
- ce qui a du POIDS HISTORIQUE : fondation/ouverture, grande rénovation ou reconstruction, changement de gouvernance/exploitant, changement d'usage, classement, fermeture.
- ce qui a de l'INTÉRÊT : gros montant, conflit ou débat notable, événement singulier, décision inhabituelle.
- ÉVITE la routine répétitive (une énième subvention annuelle, une petite acquisition de routine) SAUF si elle est la seule chose notable.

Nombre VARIABLE selon la richesse réelle du lieu : 3 minimum si possible, 6 maximum. Peu de moments forts → n'en force pas ; beaucoup → plafonne à 6 les plus importants. Si le lieu a ≤3 moments au total, tous sont « forte ».

RÈGLES :
- Ne réécris RIEN, ne juge pas la véracité (déjà vérifiée) : tu ne fais que classer par importance.
- Utilise les "id" EXACTS présents dans le fichier. N'invente aucun id.
- La sélection doit rester lisible chronologiquement une fois affichée — choisis sur l'importance, pas sur la date.

ÉCRIS ${CACHE}/${slug}_saillance.json : {"slug":"${slug}","forte":["id1","id2",...],"raison":"une phrase disant pourquoi ces moments dominent"}.
Réponds en JSON strict : {"slug":"${slug}","n_moments":N,"n_forte":M,"note":"une phrase"}`
}

if (!SLUGS.length) {
  log('Aucun slug en args — rien à faire.')
  return { erreur: 'args vide' }
}

phase('Saillance')
const resultats = await parallel(
  SLUGS.map((slug) => () =>
    agent(promptRank(slug), { label: `saillance:${slug}`, phase: 'Saillance' })
      .then((r) => ({ slug, res: String(r).slice(0, 200) }))),
)

const ok = resultats.filter(Boolean)
log(`${ok.length}/${SLUGS.length} lieux hiérarchisés`)
return { traites: ok.length, details: ok }
