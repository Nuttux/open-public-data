# Pages légales à rédiger — RGAA + RGPD + LCEN

Sortie de la session a11y du 2026-05-07. Trois pages manquantes pour la conformité catégorie 5 de la roadmap prod. Rédactionnel structuré ci-dessous, prêt à être implémenté en `page.tsx` (ou MDX) sur le modèle de `src/app/contact/`.

Routes existantes : `/contact`, `/confidentialite` — donc la nav doit déjà contenir un footer "Mentions / Confidentialité / Accessibilité / Licence".

---

## 1. `/mentions-legales` — obligatoire LCEN art. 6-III-1

### Pourquoi
Loi pour la Confiance dans l'Économie Numérique : tout site édité en France doit identifier son éditeur et son hébergeur. Manquant = amende jusqu'à 75 k€.

### Sections à écrire

**Éditeur du site**
- Nom du collectif / personne / structure
- Statut juridique (association loi 1901, indépendant, SAS, ?) — **À TRANCHER**
- Adresse postale (au moins ville si pas siège déclaré)
- Email de contact
- Numéro RNA / SIREN si association

**Directeur de publication**
- Nom complet de la personne responsable du contenu

**Hébergeur**
- Nom de l'hébergeur (Vercel ? Cloudflare Pages ? OVH ?) — **À CONFIRMER**
- Adresse de l'hébergeur
- Téléphone hébergeur

**Propriété intellectuelle**
- Le code source est sous licence MIT (cf. `/methode`)
- Les données dérivées sont sous licence X (renvoi vers `/licence`)
- Les contenus éditoriaux (articles, analyses) sont sous CC BY 4.0 (proposition — à valider)

**Contact pour signalement**
- Email + lien vers `/contact`
- SLA de réponse (24h ouvrées ? 7 jours ?)

### À fournir AVANT rédaction
- [ ] Statut juridique du collectif
- [ ] Nom et coordonnées du directeur de publication
- [ ] Identification précise de l'hébergeur (probablement Vercel d'après le stack Next.js)

---

## 2. `/accessibilite` — obligatoire RGAA art. 47

### Pourquoi
Tout site à vocation de service public doit publier une déclaration d'accessibilité datée, indiquant le niveau de conformité, les non-conformités connues, le contact en cas de problème. Format défini par arrêté DINUM.

### Sections (modèle DINUM officiel)

**Déclaration d'accessibilité**
- "Le collectif France Open Data s'engage à rendre son site accessible conformément à l'article 47 de la loi n° 2005-102 du 11 février 2005."
- Cette déclaration s'applique à : `https://franceopendata.org` (et sous-domaines).

**État de conformité**
- "Le site `franceopendata.org` est en **conformité partielle** avec le RGAA 4.1 en raison des non-conformités énumérées ci-dessous."
  *(Conformité totale = 100% audit externe ; partielle = >50% ; non-conforme = <50%. On démarre en partielle, à reclasser après audit Tanaguru.)*

**Résultats des tests**
- Audit interne réalisé le **2026-05-07** avec axe-core 4.x + Lighthouse a11y, sur les pages clés :
  - Landing : score Lighthouse 100/100
  - Subventions : 97/100
  - Marchés publics : 97/100
  - Méthode : 100/100
- 0 violation critique ou sérieuse axe-core sur les 4 pages auditées (desktop + mobile).
- Audit externe formel par cabinet agréé (Tanaguru / Access42) **non encore réalisé** — prévu Q3 2026.

**Contenus non accessibles (à compléter au fil de l'audit)**
- Cartes interactives Leaflet (`/qui-recoit`, `/marches-publics`) : alternative tabulaire fournie en dessous de la carte, mais zoom/pan non accessible au clavier sur le composant cartographique lui-même. *Compensation : tableau exportable CSV/JSON.*
- Graphiques ECharts : description textuelle aria-label sur le `<svg>` parent ; les détails segment-par-segment ne sont pas individuellement focusables. *Compensation : données brutes téléchargeables.*
- (À enrichir dès qu'un utilisateur signale un blocage.)

**Établissement de cette déclaration**
- Date d'établissement : 2026-05-07
- Date de dernière mise à jour : 2026-05-07
- Technologie utilisée pour le site : Next.js 16, React 19, CSS modules
- Outils utilisés pour les tests : axe-core 4.x via Playwright, Lighthouse 12.x

**Retour d'information et contact**
- "Si vous n'arrivez pas à accéder à un contenu ou à un service, contactez-nous via [contact@franceopendata.org] ou le formulaire `/contact`. Nous vous répondrons sous 5 jours ouvrés et vous orienterons vers une alternative accessible."

**Voies de recours**
- Texte type imposé par l'arrêté :
  > "Cette procédure est à utiliser dans le cas suivant : vous avez signalé au responsable du site internet un défaut d'accessibilité qui vous empêche d'accéder à un contenu ou à un service du portail et vous n'avez pas obtenu de réponse satisfaisante.
  >
  > Vous pouvez :
  > - Écrire un message au Défenseur des droits (https://formulaire.defenseurdesdroits.fr/)
  > - Contacter le délégué du Défenseur des droits dans votre région (https://www.defenseurdesdroits.fr/saisir/delegues)
  > - Envoyer un courrier par la poste : Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07."

### À fournir AVANT publication
- [ ] Email officiel de contact accessibilité (peut être contact@…)
- [ ] Engagement de SLA (5 jours ouvrés proposé)
- [ ] Liste exhaustive des contenus non accessibles connus (à compléter après un sweep manuel des cartes/charts)

---

## 3. `/licence` — recommandé pour la transparence

### Pourquoi
Les données ouvertes de la Ville de Paris sont publiées sous **Licence Ouverte 2.0 (Etalab)**. Notre site applique des transformations (enrichissement SIRENE, classification thématique, agrégation) — il faut clarifier la licence sur ces données dérivées + l'attribution.

### Sections

**Sources des données primaires**
- Tableau récapitulatif (modèle existant : voir `/methode#sources`)
- Pour chaque source : nom du jeu, producteur, URL stable, licence d'origine, date de mise à jour la plus récente

**Licence des données dérivées**
- Les données calculées et publiées sur `franceopendata.org` (agrégats annuels, classifications thématiques, enrichissements SIRENE, géolocalisations résolues) sont publiées sous **Licence Ouverte 2.0** par compatibilité avec les sources primaires.
- Toute réutilisation est libre, à condition de mentionner la source : *« franceopendata.org · données dérivées des publications de la Ville de Paris, Etalab et INSEE »*.

**Licence du code**
- Le pipeline (Python + dbt) et le site (Next.js) sont publiés sous **MIT License**.
- Code source : https://github.com/Nuttux/open-public-data (à confirmer).

**Licence des contenus éditoriaux**
- Articles, analyses, méthodologie publiés sous **CC BY 4.0** (proposition — autorise la réutilisation avec attribution).

**Attributions**
- Données : Ville de Paris (Open Data), État (DECP, DGFiP, INSEE), DRIHL, DPE.
- Code OSS utilisé : Next.js (Vercel, MIT), echarts (Apache 2.0), Leaflet (BSD-2), …
- *(À enrichir avec une liste exhaustive des deps OSS principales.)*

**Citer correctement**
- Format de citation recommandé pour un journaliste / chercheur :
  > « D'après franceopendata.org, données dérivées de Paris Open Data (Licence Ouverte 2.0). Méthodologie : franceopendata.org/methode. »

### À fournir AVANT publication
- [ ] Confirmation licence éditoriale (CC BY 4.0 ?)
- [ ] Confirmation licence code (MIT a priori — vérifier `LICENSE` dans le repo)
- [ ] URL canonique du repo public

---

## 4. Mise à jour `/confidentialite` — vérifier conformité RGPD/CNIL

La page existe mais à auditer rapidement :

- [ ] Mention explicite : pas de cookies tiers (à vérifier — PostHog est dans deps)
- [ ] Si PostHog actif : bandeau cookies CNIL conforme (consentement explicite, refus aussi visible que l'acceptation)
- [ ] Liste des données collectées (sessions, interactions, IP anonymisée…)
- [ ] Durée de conservation
- [ ] Droit d'accès / suppression / portabilité (RGPD art. 15-22)
- [ ] Contact DPO ou délégué (si pertinent — pas obligatoire en deçà du seuil)
- [ ] Base légale du traitement (intérêt légitime ? consentement ?)

---

## Ordre de priorité recommandé

1. **`/mentions-legales`** — risque juridique direct (LCEN). 1h de rédaction une fois les infos éditeur+hébergeur en main.
2. **`/accessibilite`** — obligatoire RGAA, mais le contenu est déjà 80% prêt grâce à l'audit qu'on vient de faire (chiffres Lighthouse, dates, outils utilisés). 30 min de mise en forme.
3. **`/licence`** — pas obligatoire mais c'est ÇA qui distingue un projet open data sérieux d'un blog perso. 1h.
4. **Audit `/confidentialite`** — vérifier que PostHog est conforme. 30 min.

Total : ~3h de rédaction une fois les infos éditeur/hébergeur fournies.

## Décisions à prendre AVANT rédaction

- [ ] Statut juridique du collectif France Open Data (asso 1901 ? indépendant ?)
- [ ] Nom et coordonnées du directeur de publication
- [ ] Hébergeur officiel (Vercel ? autre ?)
- [ ] Email de contact pour accessibilité (contact@ suffit ou dédier accessibilite@)
- [ ] Licence du code (MIT à confirmer dans le `LICENSE`)
- [ ] Licence des contenus éditoriaux (CC BY 4.0 proposé)
- [ ] PostHog est-il vraiment actif en prod ou désactivé ?
