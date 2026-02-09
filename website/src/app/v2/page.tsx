'use client';

/**
 * Landing Page V2 - "Civic Tech" alternative
 * 
 * Repositionnement éditorial :
 * - Ton journalistique / pédagogique (inspiré du blog "Décrypter les finances")
 * - Lead avec les questions citoyennes, pas les features produit
 * - Chiffres réels en avant-plan immédiat
 * - Vocabulaire civique (pas SaaS)
 * - Palette bleu/ambre institutionnelle (pas violet startup)
 * 
 * Route: /v2 (pour comparaison A/B avec la landing actuelle)
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import BudgetSankey from '@/components/BudgetSankey';
import type { BudgetData } from '@/lib/formatters';

/** Chiffres-clés du budget 2026 voté (arrondis pour la landing) */
const KEY_FIGURES = {
  budgetTotal: '11,7 Md€',
  depensesFonctionnement: '9,3 Md€',
  investissement: '3,2 Md€',
  nbAssociationsSubventionnees: '6 000+',
  anneesDonnees: '2019–2026',
};

export default function LandingPageV2() {
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);

  /** Charger les données 2026 (budget voté) pour le Sankey de démonstration */
  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/data/budget_sankey_2026.json');
        if (response.ok) {
          const data = await response.json();
          setBudgetData(data);
        }
      } catch (error) {
        console.error('Erreur chargement données Sankey:', error);
      }
    }
    loadData();
  }, []);

  return (
    <main className="min-h-screen">

      {/* ============================================
          BANNIÈRE ÉLECTIONS - Ton neutre / civique
          ============================================ */}
      {/* ============================================
          BANNIÈRE - Données mises à jour
          ============================================ */}
      <section className="border-b border-slate-800 bg-slate-900/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/15 rounded-full text-blue-400 text-xs font-medium border border-blue-500/20">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400"></span>
                </span>
                Mis à jour
              </span>
              <p className="text-sm text-slate-300">
                Budget voté 2026 disponible, ainsi que les comptes administratifs 2019–2024.
              </p>
            </div>
            <Link
              href="/evolution"
              className="text-xs text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap transition-colors"
            >
              Voir l&apos;évolution 2019–2024 →
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================
          HERO - La question, pas le produit
          ============================================ */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-10">
          <div className="text-center max-w-3xl mx-auto mb-14">
            {/* Le chiffre d'abord */}
            <p className="text-sm sm:text-base font-medium text-blue-400 mb-4 tracking-wide">
              Chaque année, Paris dépense
            </p>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-slate-50 mb-4 tracking-tight">
              {KEY_FIGURES.budgetTotal}
            </h1>
            <p className="text-xl sm:text-2xl text-slate-300 mb-3 font-medium">
              Savez-vous où va cet argent ?
            </p>
            <p className="text-base sm:text-lg text-slate-400 mb-10 max-w-xl mx-auto leading-relaxed">
              Données Lumières collecte, modélise et rend lisibles les finances 
              de la Ville de Paris, sans jargon comptable et sans agenda politique
            </p>

            {/* CTAs - vocabulaire citoyen */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/budget"
                className="w-full sm:w-auto px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
              >
                Consulter les comptes
              </Link>
              <Link
                href="/evolution"
                className="w-full sm:w-auto px-7 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg border border-slate-700 hover:border-slate-600 transition-all duration-200"
              >
                Voir l&apos;évolution depuis 2019
              </Link>
            </div>
          </div>

          {/* Source - visible dès le hero */}
          <div className="flex items-center justify-center gap-4 mb-8 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Sources officielles + enrichissement maison
            </span>
            <span className="text-slate-700">·</span>
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Pipeline open source
            </span>
            <span className="text-slate-700">·</span>
            <span>{KEY_FIGURES.anneesDonnees}</span>
          </div>
        </div>
      </section>

      {/* ============================================
          SANKEY - Cadré comme une infographie, pas un produit
          ============================================ */}
      <section className="border-t border-slate-800 bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="mb-6">
            <h2 className="text-lg sm:text-xl font-bold text-slate-200 mb-1">
              Le trajet de votre argent en 2026 <span className="text-sm font-normal text-slate-400">(budget voté)</span>
            </h2>
            <p className="text-sm text-slate-400">
              D&apos;où viennent les recettes et où partent les dépenses, 
              cliquez sur un flux pour explorer le détail
            </p>
          </div>

          {budgetData ? (
            <BudgetSankey data={budgetData} />
          ) : (
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 h-[500px] flex items-center justify-center">
              <div className="text-center">
                <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Chargement de la visualisation...</p>
              </div>
            </div>
          )}

          <div className="mt-4 text-center">
            <Link
              href="/budget"
              className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
              Explorer chaque poste en détail →
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================
          QUESTIONS CITOYENNES 
          (remplace "Problème #1 / Notre solution")
          ============================================ */}
      <section className="py-16 sm:py-20 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-4">
              Les questions que vous vous posez
            </h2>
            <p className="text-base text-slate-400">
              On a épluché 6 ans de comptes administratifs pour y répondre.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Question 1 — Budget → rose (couleur dépenses/flux) */}
            <Link href="/budget" className="group">
              <div className="h-full p-6 rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 hover:border-rose-500/30 transition-all duration-200">
                <p className="text-lg font-semibold text-slate-100 mb-3 group-hover:text-rose-400 transition-colors">
                  Combien coûte le fonctionnement de Paris ?
                </p>
                <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                  {KEY_FIGURES.depensesFonctionnement} par an rien que pour faire tourner 
                  la ville au quotidien : salaires, entretien, cantines, éclairage public
                </p>
                <span className="text-xs text-rose-400 font-medium">
                  Flux budgétaires →
                </span>
              </div>
            </Link>

            {/* Question 2 — Subventions → purple (couleur accent subventions) */}
            <Link href="/subventions" className="group">
              <div className="h-full p-6 rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 hover:border-purple-500/30 transition-all duration-200">
                <p className="text-lg font-semibold text-slate-100 mb-3 group-hover:text-purple-400 transition-colors">
                  Qui reçoit des subventions ?
                </p>
                <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                  Plus de {KEY_FIGURES.nbAssociationsSubventionnees} associations reçoivent de 
                  l&apos;argent de la Ville, classées par thématique et par montant
                </p>
                <span className="text-xs text-purple-400 font-medium">
                  Subventions & bénéficiaires →
                </span>
              </div>
            </Link>

            {/* Question 3 — Investissements → amber (couleur accent investissements) */}
            <Link href="/investissements" className="group">
              <div className="h-full p-6 rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 hover:border-amber-500/30 transition-all duration-200">
                <p className="text-lg font-semibold text-slate-100 mb-3 group-hover:text-amber-400 transition-colors">
                  Quels travaux dans mon quartier ?
                </p>
                <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                  Écoles, gymnases, voirie : tous les projets d&apos;investissement 
                  géolocalisés, arrondissement par arrondissement
                </p>
                <span className="text-xs text-amber-400 font-medium">
                  Carte des travaux →
                </span>
              </div>
            </Link>

            {/* Question 4 — Évolution → emerald (couleur santé financière / recettes) */}
            <Link href="/evolution" className="group">
              <div className="h-full p-6 rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 hover:border-emerald-500/30 transition-all duration-200">
                <p className="text-lg font-semibold text-slate-100 mb-3 group-hover:text-emerald-400 transition-colors">
                  La ville s&apos;endette-t-elle ?
                </p>
                <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                  Emprunts, épargne brute, surplus ou déficit, 
                  on retrace l&apos;évolution année par année depuis 2019
                </p>
                <span className="text-xs text-emerald-400 font-medium">
                  Évolution & santé financière →
                </span>
              </div>
            </Link>

            {/* Question 5 — Patrimoine → violet (couleur bilan central) */}
            <Link href="/patrimoine" className="group">
              <div className="h-full p-6 rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 hover:border-violet-500/30 transition-all duration-200">
                <p className="text-lg font-semibold text-slate-100 mb-3 group-hover:text-violet-400 transition-colors">
                  Que possède Paris ?
                </p>
                <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                  Terrains, bâtiments, réseaux : le patrimoine de la ville 
                  face à sa dette, le bilan comptable rendu lisible
                </p>
                <span className="text-xs text-violet-400 font-medium">
                  Bilan actif / passif →
                </span>
              </div>
            </Link>

            {/* Question 6 — Prévision → orange (couleur voté vs exécuté) */}
            <Link href="/prevision" className="group">
              <div className="h-full p-6 rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 hover:border-orange-500/30 transition-all duration-200">
                <p className="text-lg font-semibold text-slate-100 mb-3 group-hover:text-orange-400 transition-colors">
                  Le budget voté est-il réellement dépensé ?
                </p>
                <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                  Comparaison entre le budget voté par le Conseil de Paris et
                  les dépenses réellement exécutées, avec estimation pour 2025-2026
                </p>
                <span className="text-xs text-orange-400 font-medium">
                  Voté vs Exécuté →
                </span>
              </div>
            </Link>

            {/* Question 7 — Logements → emerald (couleur accent logements sociaux) */}
            <Link href="/carte" className="group">
              <div className="h-full p-6 rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 hover:border-emerald-500/30 transition-all duration-200">
                <p className="text-lg font-semibold text-slate-100 mb-3 group-hover:text-emerald-400 transition-colors">
                  Où sont les logements sociaux financés ?
                </p>
                <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                  La carte des logements sociaux financés par la Ville 
                  depuis 2010, avec le détail par arrondissement et par programme
                </p>
                <span className="text-xs text-emerald-400 font-medium">
                  Carte des logements →
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================
          SECTION CONFIANCE / MÉTHODOLOGIE
          (remplace "Features" / "Notre solution")
          ============================================ */}
      <section className="py-16 sm:py-20 border-t border-slate-800 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-4">
              Pourquoi nous faire confiance ?
            </h2>
            <p className="text-base text-slate-400">
              Beaucoup de sites affichent des chiffres sur les finances publiques, 
              voici pourquoi les nôtres sont vérifiables
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Pilier 1 : Sources */}
            <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mb-3">
                Au-delà de l&apos;Open Data
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                On part des <strong className="text-slate-300">Comptes Administratifs</strong> sur{' '}
                <a href="https://opendata.paris.fr/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">opendata.paris.fr</a>, 
                mais on va plus loin : on extrait les investissements localisés depuis 
                les PDFs du Conseil de Paris, on géolocalise les projets par arrondissement 
                et on classifie les subventions par thématique
              </p>
            </div>

            {/* Pilier 2 : Méthodologie */}
            <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mb-3">
                Pipeline auditable
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Chaque étape de transformation, du fichier CSV brut à la visualisation 
                finale, est documentée et reproductible. Si un chiffre vous semble 
                étrange, vous pouvez remonter jusqu&apos;à la source dans{' '}
                <Link href="/blog" className="text-amber-400 hover:underline">
                  nos articles
                </Link>
              </p>
            </div>

            {/* Pilier 3 : Open Source */}
            <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mb-3">
                Code source ouvert
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Tout le code est sur{' '}
                <a 
                  href="https://github.com/your-org/open-public-data" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-emerald-400 hover:underline"
                >
                  GitHub
                </a>
                , des scripts d&apos;extraction aux modèles de données. 
                Vous pouvez reproduire chaque résultat ou proposer des améliorations
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================
          COMPRENDRE EN 30 SECONDES
          (section pédagogique courte - le ton du blog)
          ============================================ */}
      <section className="py-16 sm:py-20 border-t border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-10 text-center">
            Le budget en 30 secondes
          </h2>

          <div className="space-y-6">
            {/* Fonctionnement */}
            <div className="flex gap-4 sm:gap-6 items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <span className="text-blue-400 font-bold text-sm">1</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100 mb-1">
                  Le quotidien : {KEY_FIGURES.depensesFonctionnement}/an
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Salaires des agents, cantines, éclairage, entretien des rues, 
                  subventions aux associations : c&apos;est ce qu&apos;on appelle 
                  la section de <strong className="text-slate-300">fonctionnement</strong>
                </p>
              </div>
            </div>

            {/* Investissement */}
            <div className="flex gap-4 sm:gap-6 items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <span className="text-amber-400 font-bold text-sm">2</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100 mb-1">
                  L&apos;avenir : {KEY_FIGURES.investissement}/an
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Construire des écoles, rénover des gymnases, aménager des parcs, 
                  c&apos;est la section d&apos;<strong className="text-slate-300">investissement</strong>, 
                  financée en partie par l&apos;emprunt
                </p>
              </div>
            </div>

            {/* La règle d'or */}
            <div className="flex gap-4 sm:gap-6 items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <span className="text-emerald-400 font-bold text-sm">3</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100 mb-1">
                  La règle d&apos;or
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Une ville <strong className="text-slate-300">doit</strong> avoir plus de recettes 
                  que de dépenses en fonctionnement. Le surplus, 
                  l&apos;<strong className="text-slate-300">épargne brute</strong>, c&apos;est ce qui 
                  permet ensuite de financer les projets et de rembourser la dette
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/blog"
              className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
              Lire le guide complet sur le blog →
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================
          QUI SOMMES-NOUS — Mission, pas produit
          ============================================ */}
      <section className="py-16 sm:py-20 border-t border-slate-800 bg-slate-900/40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-6">
            Un projet citoyen, indépendant et bénévole
          </h2>
          <p className="text-base sm:text-lg text-slate-400 mb-8 max-w-2xl mx-auto leading-relaxed">
            Données Lumières est une initiative associative, indépendante de tout parti 
            et de la Mairie. On pense juste que comprendre les comptes de sa ville 
            ne devrait pas nécessiter un diplôme de comptabilité publique
          </p>

          <div className="grid sm:grid-cols-3 gap-6 text-center mb-10">
            <div>
              <p className="text-3xl font-bold text-slate-100">6</p>
              <p className="text-sm text-slate-400 mt-1">années de données</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-100">100%</p>
              <p className="text-sm text-slate-400 mt-1">open source</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-100">0 €</p>
              <p className="text-sm text-slate-400 mt-1">d&apos;abonnement</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/budget"
              className="w-full sm:w-auto px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-all duration-200"
            >
              Consulter les comptes
            </Link>
            <a
              href="https://github.com/your-org/open-public-data"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-7 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg border border-slate-700 hover:border-slate-600 transition-all duration-200"
            >
              Contribuer au projet
            </a>
          </div>
        </div>
      </section>

      {/* ============================================
          FOOTER
          ============================================ */}
      <footer className="py-8 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">🏛️</span>
              <div>
                <p className="text-slate-300 font-semibold text-sm">Données Lumières</p>
                <p className="text-xs text-slate-500">
                  Initiative citoyenne pour la transparence des finances publiques
                </p>
              </div>
            </div>
            
            <div className="text-xs text-slate-500 text-center sm:text-right space-y-0.5">
              <p>
                Sources : <a href="https://opendata.paris.fr/" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:underline">Open Data Paris</a> · Comptes administratifs M57 · PDFs Conseil de Paris
              </p>
              <p>
                Licence MIT · <a href="https://github.com/your-org/open-public-data" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:underline">Code source sur GitHub</a>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
