# Website — Données Lumières

> Next.js 16 (App Router) + Tailwind + ECharts + Leaflet

## 🚀 Démarrage

```bash
npm install
npm run dev
# → http://localhost:3000
```

## 📁 Structure

```
website/
├── src/app/
│   ├── page.tsx            # Landing (/)
│   ├── budget/page.tsx     # Sankey (/budget)
│   ├── evolution/page.tsx  # Charts temporels
│   ├── subventions/page.tsx# Treemap + table
│   ├── carte/page.tsx      # Map interactive
│   └── blog/               # Articles MDX
├── content/blog/           # Fichiers .mdx
└── public/data/            # JSON (généré par pipeline)
```

## 🎨 Stack

- **Framework** : Next.js 16 (Turbopack)
- **Styling** : Tailwind CSS v4
- **Charts** : ECharts via `echarts-for-react`
- **Maps** : Leaflet via `react-leaflet`
- **Blog** : MDX avec `next-mdx-remote`

## 📊 Données

Les JSON dans `public/data/` sont générés par le pipeline :

```bash
cd ../pipeline
python scripts/export/export_all.py
```

## 🛠️ Commandes

```bash
npm run dev       # Dev server
npm run build     # Build production
npm run lint      # ESLint
```
