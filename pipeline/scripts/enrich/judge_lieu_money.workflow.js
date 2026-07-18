export const meta = {
  name: 'judge-lieu-money',
  description: 'Rattache l\'argent public à un lieu : juge chaque candidat (subvention/projet) et cite un signal exact, puis vérif adverse. args = liste de slugs.',
  phases: [
    { title: 'Jugement', detail: 'un agent classe chaque candidat argent et écrit le resolved' },
    { title: 'Vérif', detail: 'un vérificateur exige une preuve concrète, sinon retire l\'attribution' },
  ],
}

// « Le flou propose, un signal exact dispose ». Un rapprochement de nom ou une
// distance <200 m n'est qu'un CANDIDAT : le juge doit citer une preuve concrète
// (objet de la subvention, SIRET, nom du projet, distance) pour rattacher, et
// classer le reste en homonyme / voisin / sans-rapport. La vérif adverse retire
// toute attribution dont la preuve ne tient pas — jamais d'argent fabriqué sur
// une fiche. Sortie : {slug}_money_resolved.json (+ {slug}_perimetre.json).
// Invocation : Workflow({ scriptPath:'<ce fichier>', args:['slug-a', ...] })

const CACHE = '/Users/daniel/code/open-public-data/pipeline/cache/lieux'
const SLUGS = Array.isArray(args)
  ? args
  : (typeof args === 'string' && args.trim().startsWith('[') ? JSON.parse(args) : [])

const REGLES = `RÈGLES DE RATTACHEMENT (raison d'être de la vérif) :
- SIGNAL EXACT OBLIGATOIRE : ne rattacher un candidat que si une preuve concrète le lie AU LIEU PHYSIQUE — objet de subvention qui nomme le lieu, SIRET connu de l'exploitant, nom de projet qui nomme le lieu. Un simple rapprochement de nom flou ou une distance seule NE SUFFIT PAS pour "au-lieu".
- EXPLOITANT vs RÉSIDENT : exploitant = gère/fait fonctionner le lieu (subvention de fonctionnement au nom du lieu). résident = reçoit une aide pour une activité DANS le lieu (objet « … au Théâtre X », « diffusion … à … ») sans le gérer.
- HOMONYME / SANS-RAPPORT : un bénéficiaire au nom voisin mais SIRET/objet incompatibles = homonyme → écarté. Un objet qui ne parle pas du lieu = sans-rapport → écarté.
- PROJET au-lieu vs VOISIN : un projet <200 m dont le NOM nomme un AUTRE lieu (ex. « PHILHARMONIE » à 93 m d'un théâtre voisin) = voisin → écarté. "au-lieu" seulement si le nom du projet nomme CE lieu, ou si le contexte le prouve.
- MARCHÉ au-lieu vs SANS-RAPPORT : un marché compte si son OBJET porte sur CE lieu (travaux, entretien, exploitation, équipement, prestation qui s'y déroule). Écarter quand le lieu n'est qu'un REPÈRE D'ADRESSE (« voirie rue X, face au théâtre Y »), quand l'objet vise un marché-cadre de toute la Ville qui cite le lieu en exemple, et quand c'est un homonyme. Le champ « lieu_execution » (DECP) est un indice utile mais un lieu d'exécution large (« Paris ») ne prouve rien.
- MULTI-LIEU : si l'exploitant gère plusieurs sites (le total ne va pas à ce seul bâtiment), écrire {slug}_perimetre.json avec une note_publique honnête ("… gère aussi …").
- CONFIANCE : "haute" seulement si la preuve est explicite ; sinon "moyenne" et, si trop faible, ne pas rattacher.
- AUCUNE INVENTION : ne jamais écrire un montant ou un objet absent des candidats.`

function promptJuge(slug) {
  return `Tu rattaches l'argent public à un lieu parisien pour un site de transparence. RÈGLE ABSOLUE : aucune attribution sans preuve concrète citée.

Lis ${CACHE}/${slug}_money_candidates.json : {slug, name, kind_fr, arrondissement, aliases, subventions_candidates:[{beneficiaire, siret, objet_principal, montant_total, signal}], projets_candidats:[{annee, montant_eur, nom_projet, distance_m}], marches_candidats:[{numero_marche, objet, fournisseur, fournisseur_siret, montant_max, date_notification, lieu_execution, signal}]}.
Lis aussi ${CACHE}/${slug}_ctx.json (fenêtres de délibérations autour du lieu) pour CONFIRMER l'identité et l'adresse du lieu, et distinguer un exploitant réel d'un homonyme.

Pour CHAQUE subvention_candidate : classe "exploitant" / "resident" / "homonyme" / "sans-rapport". Pour CHAQUE projet_candidat : classe "au-lieu" / "voisin". Pour CHAQUE marche_candidat : classe "au-lieu" / "sans-rapport". Ne garde QUE les exploitant/resident (subv), au-lieu (projets) et au-lieu (marchés), chacun avec une "preuve" concrète (cite l'objet, le SIRET, le nom du projet, la distance — verbatim quand possible) et "confiance".

${REGLES}

ÉCRIS ${CACHE}/${slug}_money_resolved.json :
{"slug":"${slug}","subventions":[{"beneficiaire","role":"exploitant|resident","preuve","confiance":"haute|moyenne","montant_total":<number>,"siret":<string|null>}],"projets":[{"nom_projet","annee","montant_eur":<number>,"role":"au-lieu","preuve","confiance"}],"marches":[{"numero_marche","objet","fournisseur","montant_max":<number>,"date_notification","role":"au-lieu","preuve","confiance"}]}
Si l'exploitant gère plusieurs sites, ÉCRIS AUSSI ${CACHE}/${slug}_perimetre.json : {"slug":"${slug}","perimetre":"multi","autres_sites":[...],"note_publique":"…","preuve":"…"}. Sinon ne crée pas ce fichier.
Si RIEN n'est rattachable, écris quand même le resolved avec des tableaux vides.

Réponds en JSON strict : {"slug":"${slug}","n_subv":N,"n_projets":N,"n_marches":N,"ecartes":N,"note":"une phrase"}`
}

function promptVerif(slug) {
  return `Contrôle adverse PUIS correction du rattachement d'argent d'un lieu, en une passe. Sois sévère : en cas de doute sur une preuve, RETIRE l'attribution.

Compare ${CACHE}/${slug}_money_resolved.json avec ses candidats ${CACHE}/${slug}_money_candidates.json et le contexte ${CACHE}/${slug}_ctx.json.
1. Pour chaque subvention/projet/marché retenu : la preuve cite-t-elle un signal EXACT (objet nommant le lieu, SIRET de l'exploitant, nom de projet nommant le lieu) ? Un montant provient-il bien d'un candidat (jamais inventé) ? Un projet retenu nomme-t-il un AUTRE lieu (voisin déguisé en au-lieu) ? Un "exploitant" est-il en fait un homonyme (SIRET/objet incompatibles) ? Un marché retenu ne fait-il que citer le lieu comme repère d'adresse, ou est-ce un marché-cadre de toute la Ville ?

${REGLES}

2. CORRIGE directement dans ${CACHE}/${slug}_money_resolved.json : retire toute attribution sans preuve concrète, requalifie exploitant→resident si besoin, corrige un rôle de projet voisin. Si un exploitant multi-lieu n'a pas de ${slug}_perimetre.json, crée-le.
3. Re-vérifie : chaque montant vient d'un candidat, chaque preuve est concrète.

Réécris le(s) fichier(s) au même format. Réponds en JSON strict : {"slug":"${slug}","retirees":N,"requalifiees":N,"verdict":"ok|corrections","resume":"une phrase"}`
}

if (!SLUGS.length) {
  log('Aucun slug en args — rien à faire.')
  return { erreur: 'args vide' }
}

phase('Jugement')
const resultats = await pipeline(
  SLUGS,
  (slug) => agent(promptJuge(slug), { label: `juge:${slug}`, phase: 'Jugement' }),
  (juge, slug) => agent(promptVerif(slug), { label: `verif:${slug}`, phase: 'Vérif' })
    .then((v) => ({ slug, juge: String(juge).slice(0, 200), verif: String(v).slice(0, 300) })),
)

const ok = resultats.filter(Boolean)
log(`${ok.length}/${SLUGS.length} lieux jugés + vérifiés`)
return { traites: ok.length, details: ok }
