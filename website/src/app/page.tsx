'use client';

/**
 * Landing Page - Données Lumières
 * 
 * Page d'accueil présentant le projet open source de transparence
 * des finances publiques parisiennes.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import BudgetSankey from '@/components/BudgetSankey';
import type { BudgetData } from '@/lib/formatters';

export default function LandingPage() {
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);

  // Charger les données 2024 pour le Sankey de démonstration
  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/data/budget_sankey_2024.json');
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
          ELECTION BANNER - HOOK PRINCIPAL
          ============================================ */}
      <section className="relative bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border-b border-amber-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/20 rounded-full text-amber-400 text-sm font-semibold mb-4">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              Mars 2026
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-100 mb-3">
              Les élections municipales approchent
            </h1>
            <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto">
              Fin mars 2026, les Parisiens voteront. Comprenez comment votre ville 
              a été gérée ces dernières années.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================
          HERO SECTION
          ============================================ */}
      <section className="relative overflow-hidden">
        {/* Background gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-transparent to-transparent pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
          {/* Hero Content */}
          <div className="text-center max-w-4xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-100 mb-6 leading-tight">
              Données{' '}
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">
                Lumières
              </span>
            </h2>
            
            <p className="text-lg sm:text-xl text-slate-300 mb-4 font-medium">
              Comprendre les finances publiques de Paris, en toute transparence
            </p>
            
            <p className="text-base text-slate-400 mb-8 max-w-2xl mx-auto">
              Des visualisations claires, des données modélisées, des pipelines open source. 
              Parce que vous avez le droit de savoir où va votre argent.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/budget"
                className="w-full sm:w-auto px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:-translate-y-0.5"
              >
                Explorer le Budget
              </Link>
              <a
                href="https://github.com/your-org/open-public-data"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl border border-slate-700 hover:border-slate-600 transition-all duration-200"
              >
                Voir sur GitHub
              </a>
            </div>
          </div>

          {/* Sankey Diagram */}
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-amber-500/10 rounded-2xl blur-xl" />
            <div className="relative">
              {budgetData ? (
                <BudgetSankey data={budgetData} />
              ) : (
                <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 h-[600px] flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400">Chargement de la visualisation...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================
          PROBLEM SECTION
          ============================================ */}
      <section className="py-20 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-100 mb-6">
              L&apos;opacité nuit à la démocratie
            </h2>
            <p className="text-lg text-slate-400">
              Les politiques d&apos;open data publient des données, mais les rendre vraiment 
              accessibles et compréhensibles reste un défi immense.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Pain Point 1 */}
            <div className="glass-card p-8">
              <div className="text-red-400 text-sm font-semibold uppercase tracking-wider mb-4">
                Problème #1
              </div>
              <h3 className="text-xl font-bold text-slate-100 mb-4">
                Données disparates et inutilisables
              </h3>
              <p className="text-slate-400">
                Des fichiers éparpillés dans des formats incompatibles, sans documentation 
                claire sur leur nature, leurs limitations ou leurs relations.
              </p>
            </div>

            {/* Pain Point 2 */}
            <div className="glass-card p-8">
              <div className="text-red-400 text-sm font-semibold uppercase tracking-wider mb-4">
                Problème #2
              </div>
              <h3 className="text-xl font-bold text-slate-100 mb-4">
                Pas de drill-down possible
              </h3>
              <p className="text-slate-400">
                Des graphiques superficiels sans possibilité d&apos;explorer les détails. 
                Impossible de comprendre où va précisément chaque euro.
              </p>
            </div>

            {/* Pain Point 3 */}
            <div className="glass-card p-8">
              <div className="text-red-400 text-sm font-semibold uppercase tracking-wider mb-4">
                Problème #3
              </div>
              <h3 className="text-xl font-bold text-slate-100 mb-4">
                Un travail titanesque requis
              </h3>
              <p className="text-slate-400">
                Il ne devrait pas falloir être inspecteur de la Cour des Comptes pour 
                comprendre comment votre ville dépense l&apos;argent public.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================
          FEATURES SECTION
          ============================================ */}
      <section className="py-20 border-t border-slate-800 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-100 mb-6">
              Notre solution
            </h2>
            <p className="text-lg text-slate-400">
              Une plateforme open source qui transforme les données publiques brutes 
              en informations accessibles et vérifiables.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 border border-slate-700/50 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
              <h3 className="text-xl font-bold text-slate-100 mb-4">
                Dashboards interactifs
              </h3>
              <p className="text-slate-400 mb-4">
                Visualisez les flux budgétaires en quelques clics. Explorez chaque 
                catégorie de dépense et de recette en détail.
              </p>
              <p className="text-purple-400 text-sm font-medium">
                Comprenez où va chaque euro →
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 border border-slate-700/50 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
              <h3 className="text-xl font-bold text-slate-100 mb-4">
                Pipelines transparents
              </h3>
              <p className="text-slate-400 mb-4">
                Chaque transformation de données est documentée et traçable. 
                Vous savez exactement d&apos;où viennent les chiffres.
              </p>
              <p className="text-emerald-400 text-sm font-medium">
                Traçabilité = Confiance →
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 border border-slate-700/50 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
              <h3 className="text-xl font-bold text-slate-100 mb-4">
                Standards open source
              </h3>
              <p className="text-slate-400 mb-4">
                Réutilisez nos pipelines, contribuez au projet, auditez le code. 
                Un effort collectif pour la transparence.
              </p>
              <p className="text-blue-400 text-sm font-medium">
                Contribuez sur GitHub →
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================
          AUDIENCES SECTION
          ============================================ */}
      <section className="py-20 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-100 mb-6">
              Pour qui ?
            </h2>
            <p className="text-lg text-slate-400">
              Une plateforme conçue pour servir tous ceux qui veulent comprendre 
              et utiliser les données publiques.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Audience 1: Citoyens */}
            <div className="glass-card p-8 text-center group hover:border-purple-500/50 transition-colors">
              <div className="text-4xl mb-6">🏛️</div>
              <h3 className="text-xl font-bold text-slate-100 mb-4">
                Citoyens
              </h3>
              <p className="text-slate-400 mb-6">
                Comprenez où va votre argent. Soyez plus autonome dans votre compréhension 
                des politiques publiques. Votez en connaissance de cause.
              </p>
              <Link 
                href="/budget"
                className="text-purple-400 font-medium hover:text-purple-300 transition-colors"
              >
                Explorer les données →
              </Link>
            </div>

            {/* Audience 2: Journalistes */}
            <div className="glass-card p-8 text-center group hover:border-emerald-500/50 transition-colors">
              <div className="text-4xl mb-6">📰</div>
              <h3 className="text-xl font-bold text-slate-100 mb-4">
                Journalistes & Analystes
              </h3>
              <p className="text-slate-400 mb-6">
                Accédez à des données de qualité, déjà modélisées et prêtes à l&apos;emploi. 
                Concentrez-vous sur l&apos;analyse, pas sur le nettoyage.
              </p>
              <a 
                href="https://github.com/your-org/open-public-data"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 font-medium hover:text-emerald-300 transition-colors"
              >
                Accéder aux datasets →
              </a>
            </div>

            {/* Audience 3: Institutions */}
            <div className="glass-card p-8 text-center group hover:border-blue-500/50 transition-colors">
              <div className="text-4xl mb-6">🏢</div>
              <h3 className="text-xl font-bold text-slate-100 mb-4">
                Institutions publiques
              </h3>
              <p className="text-slate-400 mb-6">
                Réutilisez nos pipelines de transformation pour améliorer votre 
                infrastructure data. Standards et bonnes pratiques inclus.
              </p>
              <a 
                href="https://github.com/your-org/open-public-data"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 font-medium hover:text-blue-300 transition-colors"
              >
                Voir la documentation →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================
          CTA SECTION
          ============================================ */}
      <section className="py-20 border-t border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-100 mb-6">
            Prêt à explorer ?
          </h2>
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            Découvrez où vont les milliards d&apos;euros du budget parisien. 
            Contribuez à rendre les données publiques accessibles à tous.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link
              href="/budget"
              className="w-full sm:w-auto px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:-translate-y-0.5"
            >
              Explorer le Budget
            </Link>
            <a
              href="https://github.com/your-org/open-public-data"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl border border-slate-700 hover:border-slate-600 transition-all duration-200"
            >
              Contribuer sur GitHub
            </a>
          </div>

          {/* Social sharing */}
          <p className="text-slate-500 text-sm">
            Partagez avec ceux que ça pourrait intéresser
          </p>
        </div>
      </section>

      {/* ============================================
          FOOTER
          ============================================ */}
      <footer className="py-8 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏛️</span>
              <div>
                <p className="text-slate-300 font-semibold">Données Lumières</p>
                <p className="text-xs text-slate-500">Open Data pour la démocratie</p>
              </div>
            </div>
            
            <p className="text-xs text-slate-500 text-center sm:text-right">
              Projet open source · Données: Open Data Paris
              <br />
              Code source disponible sur GitHub
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
