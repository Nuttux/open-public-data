# Audit éditorial d'angle — 2026-05-20

**Suite de** [data-sanity wave 1](./2026-05-19-data-sanity.md) + [wave 2](./2026-05-19-data-sanity-wave2.md).

**Scope** : audit du cadrage éditorial du site (landing, footer, byline, contact, méthode). Objectif : identifier les frictions de confiance avant que tu communiques publiquement le projet.

**Méthode** : revue systématique des textes i18n FR/EN + cohérence avec les mentions légales + comparaison aux références (Anticor, Regards Citoyens, Le Monde Décodeurs).

---

## Synthèse

✅ **Le ton de fond est bon** — citoyen, accessible, sourcé. H1 *"Où va l'argent public à Paris ?"* est exactement le bon angle.

🚨 **5 frictions de confiance à corriger avant communication** :
1. **Brand inconsistant** — "Données Lumières" (navbar) vs "France Open Data" (partout ailleurs)
2. **"Collectif indépendant"** affirmé partout, alors que mentions légales disent "personne physique" (1 personne)
3. **Population Paris `2 133 111` encore hardcodée dans i18n** (3 endroits) après le fix wave 1
4. **Date "dernière revue 18 avril 2026"** hardcodée dans byline (32 jours d'écart au 20 mai)
5. **Pas de section "qui je suis / comment c'est financé"** sur la landing — un user qui arrive depuis Twitter n'a aucune info sur l'éditeur

⚠️ **2 cadrages à requestionner** :
6. Lede technique après H1 citoyen — décalage entre "Où va l'argent public ?" et "23 000 marchés depuis 2013"
7. Mention "comptes officiels" peut-être trop autoritaire (proche d'un "officiel République")

---

## 1. Brand : *Données Lumières* vs *France Open Data*

### Constat
| Surface | Nom affiché |
|---|---|
| `nav.site_title` (Navbar) | **Données Lumières** |
| `fx.nav.brand` (Brand internal) | **France Open Data** |
| `fx.foot.word_line1` + `word_line2` (Footer wordmark) | **France Open Data** |
| `fx.land.byline.name` (Byline landing) | **France Open Data** |
| `fx.foot.blurb` | **Collectif indépendant** (sans nom) |
| domain | franceopendata.org |

→ La navbar utilise "Données Lumières", **tout le reste** utilise "France Open Data".

### Hypothèse
Le projet a probablement été renommé de "Données Lumières" → "France Open Data" mais la navbar n'a pas été migrée. Le domaine `franceopendata.org` est cohérent avec le second nom.

### Recommandation
**Choisir un nom unique**. Mon avis (à valider) :
- **France Open Data** est plus explicite, plus international (`.org`), aligné avec l'angle "open data citoyenne nationale" du roadmap multi-villes.
- **Données Lumières** est joli mais ambigu (lumières = info ? sciences ? éclairage de rue ?).

→ Update `nav.site_title` à "France Open Data" partout (FR + EN). Effort : 5 min.

---

## 2. "Collectif indépendant" — promesse non tenue

### Constat
3 endroits affirment "collectif" :
- `fx.land.byline.name_suffix` = *"· collectif indépendant"* (sur la landing, sous le wordmark)
- `fx.foot.blurb` = *"Collectif indépendant. Aujourd'hui Paris — bientôt d'autres villes."*
- `fx.contact.lede` = *"France Open Data est un **collectif ouvert**."*

Mais [`/mentions-legales`](../../website/src/app/mentions-legales/MentionsLegalesClient.tsx) (légalement obligatoire d'être honnête) dit :
> *"Éditeur : Daniel Shavit, personne physique non professionnelle."*

### Problème
Pour un journaliste curieux qui vérifie : **incohérence directe**. "Collectif" en marketing, "personne physique" légalement. Si la presse écrit "selon le collectif France Open Data" et qu'un lecteur attentif clique sur les mentions, le ton de cohérence se fissure.

C'est aussi une **tentation commune des projets citoyens solo** (surjouer le "nous" pour paraître plus crédible). Mais Regards Citoyens, Anticor, Open Knowledge sont vraiment des collectifs avec une équipe nommée. Les références sérieuses du domaine ne triche pas là-dessus.

### Recommandation
3 options :
- **A — Honnêteté assumée** : remplacer "collectif indépendant" par *"projet citoyen indépendant"* ou *"initiative individuelle indépendante"*. Plus honnête, et le mot "individuel" peut même devenir un atout (David vs Goliath).
- **B — Couverture floue** : *"indépendant"* tout court, sans "collectif". Moins ambitieux, mais ne ment pas.
- **C — Construire un vrai collectif** : ajouter explicitement 2-3 contributeurs reconnus (relecteur·ices méthodo, etc.) — c'est ce que tu pourrais faire si Regards Citoyens ou un chercheur·euse accepte d'être référencé. Cf cat. 6 du roadmap "Comité de relecture indépendant pressenti".

Mon avis : **A pour l'instant, C en cible long terme**.

---

## 3. Population Paris hardcodée dans i18n (régression)

### Constat
Le fix wave 1 (PR #40) a mis à jour la population dans `seed_city_constants` + `methodology.json` : 2 133 111 (2021) → 2 113 705 (2022).

**Mais l'i18n n'a pas été mis à jour.** Le texte affiché sur la landing dit toujours **2 133 111** :

```ts
// website/src/i18n/fr.ts:1194
'fx.land.scale.cap.pop': '2 133 111',

// website/src/app/fusion-preview/page.tsx:41
caption={<>Soit ... aux <b>2 133 111</b> Parisiens et Parisiennes (INSEE).</>}

// website/src/app/ville/paris/budget/mockups/ViralMockupsClient.tsx:183
2 133 111 habitants · 12 mois · CA M57
```

### Problème
Sur la landing, dans la section "Scale" : *"Chaque mois, la Ville dépense **463 €/habitant**"* (calculé depuis la nouvelle pop 2 113 705) puis dans le caption en dessous : *"...rapporté aux **2 133 111** Parisiens..."* (texte hardcodé).

**Incohérence directe entre deux chiffres affichés sur la même page**, à 2 lignes d'écart. Un journaliste attentif le verra.

### Recommandation
Soit :
- Faire une interpolation `{population}` dans le i18n, et passer la valeur depuis methodology
- Soit retirer le chiffre du caption et écrire *"aux Parisiennes et Parisiens (INSEE 2022)"*

Effort : 10 min.

---

## 4. Date "dernière revue" hardcodée

### Constat
`fx.land.byline.meta` = *"Toutes les analyses sont reproductibles depuis les CSV bruts · **dernière revue 18 avril 2026**"*

On est le 20 mai 2026 → 32 jours d'écart. Et la prochaine fois qu'on regardera ce sera encore plus.

### Problème
Soit on s'engage à mettre à jour cette date à chaque sortie pipeline (lourd, oubli garanti), soit on retire le chiffre.

### Recommandation
Remplacer par une référence dynamique : *"dernière revue : voir [/corrections](../../website/src/app/corrections/)"*. La page corrections est maintenant à jour avec un changelog public — c'est l'endroit qui doit porter cette info.

Ou retirer la phrase si peu pertinente sur une landing.

---

## 5. Pas de section "Qui je suis / comment c'est financé"

### Constat
Un user qui arrive depuis :
- Un tweet de presse
- Un partage Slack
- Une recherche Google "budget Paris transparence"

…ne sait pas :
- **Qui** a fait ce site (un particulier ? une asso ? un cabinet de conseil ?)
- **Pourquoi** (passion, mission politique, démarche professionnelle ?)
- **Comment c'est financé** (bénévole ? subventionné ? sponsorisé ?)
- **Indépendance vis-à-vis de quoi** (la Ville ? un parti ?)

### Pourquoi ça compte
Pour un site finances publiques, **l'indépendance perçue est le premier filtre de crédibilité**. Anticor met en avant son statut associatif + financements (cotisations + dons + grants déclarés). Regards Citoyens fait pareil.

Si tu communiques le projet (post LinkedIn, newsletter, intervention conf), la première question sera : *"qui finance ?"*. Pas avoir une réponse claire sur le site = friction.

### Recommandation
Ajouter une **section discrète** sur la landing OU une page courte `/a-propos` ou `/qui-sommes-nous` (qui resterait honnête : 1 personne) avec :
1. **Qui** : "Projet citoyen porté par Daniel Shavit, à titre individuel. Code open source, données ouvertes."
2. **Pourquoi** : 2-3 lignes sur la motivation (ex : *"Constat : les chiffres budgétaires sont publiés mais très peu lus. Ce site les rend lisibles."*)
3. **Comment financé** : *"Aucun financement reçu à ce jour. Hébergement Vercel gratuit, BigQuery au pricing pay-as-you-go (~quelques €/mois). Si un financement entre, il sera publié ici avec son montant et son origine."*
4. **Indépendance** : *"Aucun lien avec la Ville de Paris, aucun parti, aucun cabinet. Si une affiliation apparaît, elle sera publiée."*

C'est **la chose la plus impactante** que tu peux faire pour ta crédibilité avant de communiquer. Effort : 1h.

---

## 6. Cadrage hero + lede — décalage citoyen → technique

### Constat
**H1** (citoyen) : *"Où va l'argent public à Paris ?"*

**Lede** (technique) : *"Budget Paris 2026 voté : 11,72 Md€. 23 000 marchés depuis 2013, 38 000 subventions depuis 2018. Tout est ici, ligne par ligne, sourcé aux comptes officiels."*

Le citoyen qui lit le H1 attend une réponse à la question. Le lede lui balance des chiffres techniques qui ne **répondent pas**.

### Pourquoi ça compte
Le Monde Décodeurs fait ça bien : H1 puis premier paragraphe qui RÉPOND, puis explore.

### Recommandation
**Option A — Lede qui répond + chiffres en sous-libellé** :
```
H1 : Où va l'argent public à Paris ?
Lede : Surtout vers l'action sociale (CASVP), les écoles, et le logement.
       Budget 2026 voté : 11,72 Md€, équivalent à 463 €/mois/habitant.
Caption (gris, plus petit) : 23 000 marchés et 38 000 subventions affichés, ligne par ligne. Source : comptes officiels.
```

**Option B — Lede plus narratif** :
```
Lede : 11,72 Md€ : c'est le budget voté de Paris pour 2026, soit 463 €/mois et par habitant.
       Ce site montre où chaque euro va, ligne par ligne — directement depuis les comptes officiels.
```

Mon avis : **B est plus lisible**, garde la promesse de transparence sans submerger.

---

## 7. "Comptes officiels" — autorité un peu trop forte ?

### Constat
Le lede dit *"sourcé aux comptes officiels"*. Honnête, mais :
- Le terme "officiel" peut être interprété comme "validé par la Ville", ce qui n'est pas vrai (tu présentes les données mais la Ville ne valide pas ta présentation).
- C'est aussi une formulation proche du registre administratif.

### Recommandation
Variantes plus précises :
- *"sourcé aux **comptes administratifs publiés**"* (technique mais juste)
- *"sourcé aux **chiffres publics** publiés par la Ville et l'État"* (citoyen)
- *"chaque chiffre vient d'**un dataset public**, vérifiable"* (engageant)

Petit ajustement, mais qui évite le risque "vous prétendez être officiel ?".

---

## Recommandations consolidées par priorité

### À faire avant communication
| # | Item | Effort |
|---|---|---|
| 1 | Brand unique : "France Open Data" partout (corriger navbar) | 5 min |
| 2 | Retirer "collectif" → "projet citoyen indépendant" (3 endroits) | 5 min |
| 3 | Population Paris : passer par interpolation methodology (3 endroits) | 10 min |
| 4 | Retirer ou rendre dynamique la date "dernière revue" | 5 min |
| 5 | Créer page `/a-propos` (qui je suis + comment financé + indépendance) | 1h |

### Dans le mois
| # | Item | Effort |
|---|---|---|
| 6 | Reformuler le lede pour qu'il réponde au H1 (option B) | 15 min |
| 7 | "Comptes officiels" → formulation plus précise | 5 min |

### Optionnel
| # | Item |
|---|---|
| 8 | Construire un vrai comité de relecture (Regards Citoyens, chercheur·euses) → permet de garder "collectif" honnêtement |

---

## Conclusion

L'**angle de fond est bon** : citoyen, accessible, sourcé. Les findings ne remettent pas en cause le projet — ils remettent en cause des **détails de surface** qui peuvent décrédibiliser au premier regard attentif.

**5 fixes < 1h chacun** te débloquent pour la communication publique. Le plus impactant : **page `/a-propos` honnête** sur l'éditeur et le financement.
