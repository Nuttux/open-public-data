# Runbook : rollback d'un déploiement cassé

## Contexte

Le site est déployé automatiquement par Vercel à chaque push sur `main` (région `cdg1`). Vercel garde l'historique des déploiements indéfiniment, ce qui rend le rollback "en un clic" trivial : on re-promeut un ancien déploiement, **le code source de `main` n'est pas modifié**.

Ce runbook couvre trois scénarios et l'ordre dans lequel les essayer.

## Quand utiliser ce runbook

- Le site en prod est cassé (page blanche, 500, données incohérentes) suite à un merge récent
- Un user a signalé une régression visible
- La CI a passé vert mais un bug runtime apparaît seulement en prod (env, données, edge case)

## Avant de rollback : confirmer que c'est bien régression

1. Ouvrir https://qipu.org en navigation privée — cache local exclu
2. Vérifier le statut Vercel : https://vercel.com/nuttuxs-projects/open-public-data
3. Vérifier qu'aucun déploiement Vercel n'est en cours (sinon attendre 2 min)
4. Reproduire le bug avec une URL stable (pas une URL de preview)

Si le bug est reproductible sur le déploiement courant mais pas sur un déploiement précédent → rollback. Sinon, c'est probablement un bug de données ou d'env, pas un rollback de code qui aide.

## Scénario A : rollback rapide via Vercel (1 minute)

C'est la méthode par défaut. Elle restaure le **build** précédent sans toucher au code source.

### Via dashboard

1. Aller sur https://vercel.com/nuttuxs-projects/open-public-data/deployments
2. Identifier le dernier déploiement **vert (✓ Production)** qui marchait — typiquement l'avant-dernier
3. Cliquer sur les `…` à droite → **Promote to Production**
4. Vérifier sur qipu.org que le site est revenu à l'état précédent (~30 s de propagation)

### Via CLI

```bash
npx vercel login           # une seule fois
npx vercel rollback        # interactif, propose les 5 derniers déploiements
```

### Effet

- ✅ Site restauré immédiatement
- ⚠️ `main` côté git **n'est pas modifié** — le commit cassé est toujours dans l'historique
- ⚠️ Le prochain push sur `main` re-déploiera **avec le bug** si tu n'as pas réparé entretemps

→ Ce rollback est une **mesure d'urgence**. Il faut enchaîner sur le scénario B.

## Scénario B : revert du commit fautif côté git

Une fois le site stabilisé via A, on retire le commit cassé du code source.

```bash
# Identifier le commit fautif via Vercel deployments
git log --oneline -5

# Revert (crée un nouveau commit qui annule l'ancien)
git revert <sha-du-commit-cassé>

# Pousser (déclenche un nouveau build Vercel propre)
git push origin main
```

Si le commit fautif est un merge (PR), utiliser `git revert -m 1 <sha>`.

### Vérifications post-revert

- [ ] `npm run typecheck` + `npm run lint` + `npm test` passent en local
- [ ] Le nouveau build Vercel passe vert
- [ ] La page concernée s'affiche correctement
- [ ] Ouvrir une issue post-mortem brève sur GitHub : symptôme, root cause, comment éviter

## Scénario C : les données sont fausses, pas le code

Si le bug est du type "les chiffres affichés sont faux mais le code est bon", le rollback Vercel n'aide pas — le site sert des `website/public/data/*.json` qui ont été régénérés par le pipeline.

```bash
# Identifier quel JSON est faux (souvent visible côté front)
# Reverter le commit pipeline qui a régénéré ce JSON
git log --oneline -- website/public/data/<fichier>.json | head -5
git revert <sha>
git push origin main
```

Si la régression vient d'une source amont (Open Data Paris a publié un fichier corrompu) :

1. Mettre une bannière "données indisponibles temporairement" sur la page concernée
2. Contacter Open Data Paris (https://opendata.paris.fr/contact)
3. Conserver le snapshot précédent dans `pipeline/cache/` pour rollback de données

## Plan B : Vercel indisponible

Vercel a un SLA 99.99 % mais peut tomber. Si dashboard inaccessible :

1. Vérifier https://vercel-status.com
2. Si confirmé en panne, communiquer côté contact (`/contact`) plutôt que de tenter un workaround
3. Le repo est public sur GitHub, le code reste consultable
4. Plan de migration (jamais exécuté à ce jour) : redéployer sur Cloudflare Pages depuis le repo en quelques heures (build identique, juste un push vers un nouveau remote)

## Qui contacter

Le projet est aujourd'hui maintenu par une seule personne. Pour signaler un incident :

- Issue GitHub : https://github.com/Nuttux/open-public-data/issues
- Page `/contact` du site

## Voir aussi

- [`promote-wip-to-production.md`](promote-wip-to-production.md) — promotion d'un script WIP en prod
- [`docs/data-platform/04-layering-convention.md`](../data-platform/04-layering-convention.md) — règles de layering pipeline
- Vercel docs rollback : https://vercel.com/docs/deployments/managing-deployments#instant-rollback
