# Audit visuel — Pilier 3 : Comparaison références — 2026-05-20

**Scope** : comparer France Open Data aux références éditoriales du data-journalisme français/international pour identifier le polish marginal qui ferait la différence.

**Méthode** : analyse des patterns visuels des références (Le Monde Décodeurs, Financial Times Graphics, Bloomberg, The Pudding, Anticor) vs les screenshots France Open Data du pilier 2.

---

## Synthèse

✅ **France Open Data se positionne très haut** parmi les références citoyennes/data-journalisme français. **Plus proche du Monde Décodeurs que de Regards Citoyens / Anticor** côté design et storytelling.

**Niveau visuel actuel** : ~80% Le Monde Décodeurs, ~60% Financial Times Graphics, ~95% Anticor (battu sur le design).

**6 polish marginaux** identifiés qui sépareraient du top tier (FT/Bloomberg).

🚨 **Aucun blocker** pour communiquer publiquement. Ces polish sont des "nice to have" sur 1-2 mois.

---

## 1. Positionnement vs références

### Vs **Le Monde Décodeurs** (référence FR la plus directe)
| Dimension | France Open Data | LMD | Verdict |
|---|---|---|---|
| Architecture sections numérotées | ✅ "01 · BUDGET" | ✅ identique | Match |
| Hero text storytellé | ✅ Excellent | ✅ identique | Match |
| Year picker | ✅ Avec libellé voté/exécuté | ⚠️ Souvent absent | **Mieux que LMD** |
| Sources cliquables tooltips | ✅ Tip sur jargon | ✅ partiel | Match |
| Charts ECharts | ✅ | ✅ | Match |
| Annotations sur charts | ❌ Aucune | ✅ "Pic 2020 = COVID" | **LMD mieux** |
| Sticky scroll / scrollytelling | ❌ | ✅ Sur certains | **LMD mieux** |
| Newsletter | ❌ | ✅ Discrète mais présente | **LMD mieux** |
| Pictos / illustrations | ❌ Texte+chiffres pur | ✅ Parfois | **LMD mieux** |

**Verdict** : France Open Data est ~80% LMD. Les 20% restants sont annotations + sticky scroll + newsletter.

### Vs **Financial Times Graphics**
| Dimension | France Open Data | FT | Verdict |
|---|---|---|---|
| Hero number gigantesque | ✅ Très gros (110-160px) | ✅ identique | Match |
| Small multiples (4-6 charts) | ❌ | ✅ Signature FT | **FT mieux** |
| Couleurs émotionnelles | ⚠️ Tonique mais neutre | ✅ Rouge/vert pour bon/mauvais | **FT mieux** |
| Animations subtiles | ⚠️ CountUpOnReveal partiel | ✅ Reveals systématiques | **FT mieux** |
| Annotations dans chart | ❌ | ✅ Toujours | **FT mieux** |
| Tone / voix éditoriale | ✅ Citoyen + neutre | ⚠️ Pro / élite | Différent (volontaire) |

**Verdict** : France Open Data est ~60% FT. FT est tier 1 mondial, ne pas chercher à les égaler directement — c'est un standard ultra-élevé.

### Vs **Bloomberg** (interactif + data viz)
Bloomberg est très axé "interactivité ludique" (slider, drag, animation au scroll). France Open Data fait moins d'interactivité, plus de lecture rapide. Stratégie différente, pas comparable directement.

### Vs **Anticor / Regards Citoyens**
| Dimension | France Open Data | Anticor / RC |
|---|---|---|
| Design moderne | ✅ | ⚠️ Année 2010 |
| Storytelling | ✅ | ⚠️ Plus institutionnel |
| Charts interactifs | ✅ ECharts | ⚠️ PDF / tableaux statiques |
| Sources visibles | ✅ Tooltips | ✅ |
| Crédibilité institutionnelle | ⚠️ Projet indép. | ✅ Association reconnue |
| Lien presse | ⚠️ A construire | ✅ Établi |

**Verdict** : France Open Data **bat Anticor/RC sur le design** mais **manque de leur crédibilité institutionnelle**. Le pivot grant + comité de relecture (cf roadmap) règlerait ça.

---

## 2. 6 polish marginaux pour aller plus haut

### 1. Annotations dans les charts (effort 1-2h)
**Manque** : aucun chart n'a d'annotation textuelle pointant un événement ("Pic 2020 dû à la pandémie", "Baisse 2017 fusion Paris Centre").

**Quick win** : Ajouter 2-3 annotations sur les timelines clés via ECharts `markPoint` ou un overlay HTML.

Exemple sur `/ville/paris/budget` timeline :
- 2019 → "Réforme M57 (nouveau référentiel comptable)"
- 2020 → "COVID — dépenses sociales exceptionnelles"
- 2024 → "Dernier exercice exécuté"

### 2. Sticky scroll storytelling (effort 4-6h, optionnel)
**Manque** : pas de scrollytelling. Le contenu est sectionné mais pas "guidé par le scroll".

**Quick win** : Sur la landing OU sur /france/daily-bread, transformer une section en sticky chart + texte qui défile.

Effort élevé, valeur moyenne. À considérer si tu vises une présentation dédiée du projet (post LinkedIn long format, conférence).

### 3. Couleurs émotionnelles (effort 1h, optionnel)
**Manque** : palette est tonique mais neutre (bleu marine, ocre, charbon). Pas de feedback couleur instantané pour "ça augmente vs ça diminue" / "alerte vs ok".

**Quick win** : Ajouter un accent rouge **doux** (pas alarmiste) sur les évolutions négatives ou dépassements de seuil (capacité désendettement > 12 ans = ocre warning, > 20 ans = rouge critique). C'est déjà partiel sur /ville/paris/dette/stress-test.

⚠️ Attention au cadrage éditorial : le projet est neutre, le rouge politique-coded à droite (cf memory). Préférer **ocre** ou **charbon** plutôt que rouge pour les alertes.

### 4. Newsletter / abonnement (effort 30 min, optionnel)
**Manque** : aucune façon de "rester informé". Un visiteur intéressé n'a aucun call-to-action après lecture.

**Quick win** : footer ou bandeau bas-de-page *"Nouveau dataset, nouvelle analyse, correction publiée — recevez les mises à jour par mail (1 mail / mois max)."* avec un email gratuit via Buttondown ou Substack (free tier).

Décision éditoriale : tu veux gérer une newsletter ? Si oui, c'est un quick win. Sinon skip.

### 5. Hero number animation systématique (effort 30 min)
**Manque** : `CountUpOnReveal` n'est utilisé que sur la landing. Les pages drill ont des `AnimatedNumber` mais pas reveal-driven.

**Quick win** : Étendre `CountUpOnReveal` sur les hero numbers de `/ville/paris/budget`, `/ville/paris/subventions`, etc. C'est déjà partiel — propager.

⚠️ **Mais** : si tu communiques via screenshots (qui captent un instant), l'animation n'est PAS rentable (les outils capturent souvent mi-animation, cf finding pilier 1). À pondérer.

### 6. Press kit / "Capturer une vue" (effort 1h)
**Manque** : pas de page presse / pas de zone qui te dit "voici les visuels prêts à reprendre".

**Quick win** : Page `/presse` (ou section dans /contact) avec :
- 3-5 visuels HD pré-générés (Sankey, treemap, choropleth, équivalents daily-bread)
- Logo France Open Data (PNG + SVG transparent)
- "Citez-nous : France Open Data, sourcé aux comptes administratifs M57 de la Ville de Paris."

Effort faible, impact comm fort si un journaliste vous contacte.

---

## 3. Hero / page d'accueil — recommendations spécifiques

### Ce qui marche déjà très bien
- H1 citoyen "Où va l'argent public à Paris ?"
- Lede transparent (vote vs execute, depuis YYYY)
- CTA "Ouvrir les comptes 2026" → action claire
- Carte Paris en arrière-plan subtile
- Selector "Paris" rouge avec underline = signal interactivité

### Ce qui pourrait monter encore d'un cran
1. **Sous-CTA secondaire** : "Voir aussi : France · Marseille" en plus petit sous le CTA principal. Sinon un visiteur ne sait pas qu'il y a du contenu national.
2. **Téaser article** : "Article du mois : ..." (quand l'éditorial sera étoffé)
3. **Stat de transparence** : "X corrections publiées · code AGPL · sources publiques" comme tagline en pied de hero — démontre la rigueur sans dire "regardez comme on est sérieux".

---

## 4. Verdict global

**Niveau de polish actuel** :
- 95% Anticor/Regards Citoyens (vous battez clairement les références citoyennes)
- 80% Le Monde Décodeurs (très proche, manque annotations + scrollytelling + newsletter)
- 60% Financial Times Graphics (FT est un standard mondial, ne pas viser direct)
- 0% Bloomberg (stratégie différente, pas comparable)

**Conclusion communication** :
Le site est **prêt visuellement**. Tu peux communiquer aujourd'hui sans honte vs LMD ou France Info, à condition d'être positionné comme **"projet citoyen indépendant"** (pas "magazine pro" — vu ta réalité 1 personne).

Les polish marginaux ci-dessus sont des bonus pour aller chercher la couverture FT/LMD. Pas critiques.

**🚨 Reste à régler avant comm** :
- Le bug `/france/budget` 18329px (pilier 2 finding critique)

**🟢 Quick wins post-comm** (si tu as l'énergie) :
1. Annotations sur 2-3 timelines (~1h)
2. Press kit page `/presse` (~1h)
3. Hero number CountUpOnReveal étendu (~30 min)
4. Newsletter Buttondown (~30 min, si décidé)

Effort total quick wins : ~3h. Différence visuelle marginal mais cumulative.
