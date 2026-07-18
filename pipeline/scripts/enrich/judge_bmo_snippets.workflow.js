export const meta = {
  name: 'judge-bmo-snippets',
  description: 'Juge la PERTINENCE des extraits du Bulletin municipal : garde ceux qui parlent du lieu, écarte les homonymes de rue. args = liste de slugs.',
  phases: [
    { title: 'Pertinence BMO', detail: 'un agent trie les extraits d\'archive lieu / homonyme' },
  ],
}

// Les extraits BMO sortent d'une recherche plein-texte sur un mot : ils attrapent
// donc la RUE homonyme, le quartier, un autre équipement. Vérifié sur la piscine
// des Amiraux : « Rue des Amiraux. — 1,600 mètres » (métré de voirie) et « Rue du
// Transvaal et rue Piat » (autre rue) côtoyaient le seul extrait réellement sur la
// piscine. Sans ce tri, la section d'archive publie du bruit daté.
// Sortie : {slug}_bmo_keep.json — les extraits retenus, avec le motif.
// Invocation : Workflow({ scriptPath:'<ce fichier>', args:['slug-a', ...] })

const CACHE = '/Users/daniel/code/open-public-data/pipeline/cache/lieux'
const SLUGS = Array.isArray(args)
  ? args
  : (typeof args === 'string' && args.trim().startsWith('[') ? JSON.parse(args) : [])

function prompt(slug) {
  return `Tu tries des extraits d'archive du Bulletin municipal officiel de la Ville de Paris pour la fiche d'un lieu parisien.

Lis ${CACHE}/${slug}_bmo_snippets.jsonl (une ligne JSON par extrait : {issue_date, ark, page, snippet, page_url}) et ${CACHE}/${slug}_ctx.json (pour connaître le lieu : son nom, son adresse, ce dont parlent les délibérations).

Les extraits viennent d'une recherche PLEIN TEXTE sur un mot du nom. Ils attrapent donc souvent autre chose que le lieu :
- la RUE ou la place homonyme (« Rue des Amiraux. — 1,600 mètres » = un métré de voirie, PAS la piscine) ;
- une autre rue citée dans la même liste (« Rue du Transvaal et rue Piat ») ;
- un homonyme (personne, navire, autre équipement) ;
- une simple entrée de sommaire ou de table sans contenu.

GARDE un extrait seulement s'il remplit LES DEUX conditions :

(1) PERTINENCE — il parle DU LIEU lui-même (sa construction, son exploitation, ses travaux, son usage, son financement, sa dénomination), OU du SITE/de l'ensemble bâti qui EST le lieu ou qui l'a fait naître (ex. l'îlot d'habitations à bon marché qui contient la piscine = recevable ; le percement de la rue vingt ans avant que le lieu existe = NON).

(2) LISIBILITÉ — c'est une citation qu'on peut publier telle quelle. Ces pages sont des scans OCRisés de 1900-1950 : beaucoup d'extraits sont de la bouillie. ÉCARTE sans hésiter :
- les mots visiblement mal reconnus (« groupa » pour groupe, « Nouoelle » pour Nouvelle, « à des 4 Okbreuses », « el-tadgulaire ») ;
- les débris de colonne : capitales isolées, « DS », « W », fragments sans syntaxe ;
- les titres courants de page (« BULLETIN MUNICIPAL OFFICIEL du samedi 8 juillet 1922 ») et les lignes de sommaire ou de bordereau ;
- les phrases tronquées dont on ne peut pas comprendre le sens.
Un extrait doit se lire comme une phrase française intelligible. Une citation illisible discrédite la page, même si elle est pertinente.

ÉCARTE tout le reste. Dans le doute, ÉCARTE : mieux vaut trois extraits justes et lisibles que dix douteux. Vise 3 à 8 extraits — les meilleurs — même quand il y en aurait davantage de recevables.

Ne réécris JAMAIS un extrait (c'est une citation d'archive) : tu ne fais que trier.

ÉCRIS ${CACHE}/${slug}_bmo_keep.json :
{"slug":"${slug}","keep":[{"ark":"...","page":<number>,"issue_date":"...","pourquoi":"<6-12 mots : ce que l'extrait dit du lieu>"}],"ecartes":<number>,"raison":"une phrase sur ce qui a été écarté"}
Si RIEN n'est pertinent, écris keep:[] — c'est un résultat valide et honnête.

Réponds en JSON strict : {"slug":"${slug}","n_lus":N,"n_gardes":M,"note":"une phrase"}`
}

if (!SLUGS.length) {
  log('Aucun slug en args — rien à faire.')
  return { erreur: 'args vide' }
}

phase('Pertinence BMO')
const resultats = await parallel(
  SLUGS.map((slug) => () =>
    agent(prompt(slug), { label: `bmo:${slug}`, phase: 'Pertinence BMO' })
      .then((r) => ({ slug, res: String(r).slice(0, 200) }))),
)

const ok = resultats.filter(Boolean)
log(`${ok.length}/${SLUGS.length} lieux triés`)
return { traites: ok.length, details: ok }
