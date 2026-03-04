'use client';

/**
 * Landing Page - Données Lumières
 *
 * Hacktivist / editorial / brutalist civic design.
 * Inspiration: ProPublica, The Markup, Bellingcat.
 * Data-first, typography-driven, no marketing polish.
 *
 * Sections: Headline + Sankey → Question Cards → Manifesto → Footer
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import BudgetSankey from '@/components/BudgetSankey';
import type { BudgetData } from '@/lib/formatters';
import { useTrack } from '@/lib/analyticsContext';

const QUESTION_CARDS = [
  {
    href: '/budget',
    category: 'Budget',
    question: 'Combien coûte le fonctionnement ?',
    detail: '9,3 Md€/an pour faire tourner la ville : salaires, cantines, éclairage, entretien des rues.',
    linkLabel: 'Flux budgétaires',
    accent: 'border-rose-500',
    accentText: 'text-rose-400',
  },
  {
    href: '/subventions',
    category: 'Subventions',
    question: 'Qui reçoit des subventions ?',
    detail: '6 000+ associations financées par la Ville, classées par thématique et par montant.',
    linkLabel: 'Bénéficiaires',
    accent: 'border-amber-500',
    accentText: 'text-amber-400',
  },
  {
    href: '/investissements',
    category: 'Investissements',
    question: 'Quels travaux dans mon quartier ?',
    detail: 'Écoles, gymnases, voirie — tous les projets géolocalisés, arrondissement par arrondissement.',
    linkLabel: 'Carte des travaux',
    accent: 'border-purple-500',
    accentText: 'text-purple-400',
  },
  {
    href: '/budget?tab=tendances',
    category: 'Tendances',
    question: 'Le budget est-il tenu ?',
    detail: 'Évolution des recettes et dépenses depuis 2019. Écarts entre budget voté et exécuté.',
    linkLabel: 'Évolution & exécution',
    accent: 'border-emerald-500',
    accentText: 'text-emerald-400',
  },
  {
    href: '/patrimoine',
    category: 'Patrimoine',
    question: 'Que possède Paris ?',
    detail: 'Terrains, bâtiments, réseaux : le patrimoine de la ville face à sa dette.',
    linkLabel: 'Bilan actif / passif',
    accent: 'border-violet-500',
    accentText: 'text-violet-400',
  },
  {
    href: '/logements',
    category: 'Logements',
    question: 'Où sont les logements sociaux ?',
    detail: 'Carte des logements sociaux financés depuis 2010, par arrondissement et par programme.',
    linkLabel: 'Carte des logements',
    accent: 'border-cyan-500',
    accentText: 'text-cyan-400',
  },
] as const;

export default function LandingPage() {
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const track = useTrack();

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

      {/* ——— 1. HEADLINE ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-10">
          <h1 className="font-mono text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            <span className="text-slate-50">LES </span>
            <span className="text-amber-400">FINANCES</span>
            <span className="text-slate-50"> DE LA </span>
            <span className="text-blue-400">VILLE DE PARIS</span>
          </h1>
          <p className="mt-2 font-mono text-3xl sm:text-4xl lg:text-5xl font-bold">
            <span className="text-slate-50">De </span>
            <span className="text-emerald-400">2019 à 2026</span>
          </p>
          <p className="mt-4 text-lg sm:text-xl text-slate-400">
            D&apos;où vient l&apos;argent, où il part — sans jargon.
          </p>
        </div>
      </section>

      {/* ——— 2. SANKEY EXAMPLE ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <h2 className="font-mono text-sm uppercase tracking-widest text-slate-400 mb-1">
            Exemple : budget voté 2026
          </h2>
          <p className="font-mono text-4xl sm:text-5xl font-extrabold text-slate-50 mb-6">
            11,7 Md€
          </p>
          {budgetData ? (
            <BudgetSankey data={budgetData} />
          ) : (
            <div className="bg-slate-900 border border-slate-600 p-6 h-[500px] flex items-center justify-center">
              <div className="text-center">
                <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-mono">Chargement...</p>
              </div>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500 font-mono">
            Source : Comptes administratifs & budget voté 2026 — opendata.paris.fr · Conseil de Paris
          </p>
        </div>
      </section>

      {/* ——— 3. EXPLORER ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 sm:pt-16 pb-2">
          <h2 className="font-mono text-lg sm:text-xl font-bold text-slate-100">
            Explorer
          </h2>
        </div>
      </section>

      {/* ——— 3b. QUESTION CARDS ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
            {QUESTION_CARDS.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                onClick={() => track('cta_click', { cta: 'question_card', destination: card.href })}
                className={`group block border border-slate-600 border-l-4 ${card.accent} p-6 hover:bg-slate-800 transition-colors -mt-px -ml-px`}
              >
                <span className={`font-mono text-xs uppercase tracking-widest ${card.accentText}`}>
                  {card.category}
                </span>
                <p className="mt-2 text-lg font-semibold text-slate-100 group-hover:text-white">
                  {card.question}
                </p>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  {card.detail}
                </p>
                <span className={`inline-block mt-4 text-sm ${card.accentText} font-mono`}>
                  {card.linkLabel} →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ——— POURQUOI C'EST DIFFÉRENT ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <h2 className="font-mono text-lg sm:text-xl font-bold text-slate-100 mb-6">
            Pas simplement de l&apos;open data
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
            <div className="border border-slate-600 border-l-4 border-l-blue-500 p-6 -mt-px -ml-px">
              <span className="font-mono text-xs uppercase tracking-widest text-blue-400">Problème</span>
              <p className="mt-2 text-lg font-semibold text-slate-100">Les données existent déjà</p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                CSV, fichiers Excel, PDFs du Conseil de Paris, opendata.paris.fr.
                Le problème n&apos;est pas l&apos;accès, c&apos;est la lisibilité.
              </p>
            </div>
            <div className="border border-slate-600 border-l-4 border-l-amber-500 p-6 -mt-px -ml-px">
              <span className="font-mono text-xs uppercase tracking-widest text-amber-400">Approche</span>
              <p className="mt-2 text-lg font-semibold text-slate-100">Transformée, modélisée, analysée</p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                Investissements extraits des délibérations, projets géolocalisés
                par arrondissement, subventions classifiées, évolution poste par poste depuis 2019.
              </p>
            </div>
            <a
              href="https://github.com/Nuttux/france-open-data"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('external_link_click', { url: 'https://github.com/Nuttux/france-open-data', text: 'open source' })}
              className="group border border-slate-600 border-l-4 border-l-emerald-500 p-6 -mt-px -ml-px hover:bg-slate-800 transition-colors"
            >
              <span className="font-mono text-xs uppercase tracking-widest text-emerald-400">Garantie</span>
              <p className="mt-2 text-lg font-semibold text-slate-100 group-hover:text-white">100% open source</p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                Chaque étape peut être répliquée, auditée, modifiée.
                Si un chiffre vous semble faux, remontez jusqu&apos;à la source.
              </p>
              <span className="inline-block mt-4 text-sm text-emerald-400 font-mono">GitHub →</span>
            </a>
          </div>
        </div>
      </section>

      {/* ——— À QUI ÇA SERT ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <h2 className="font-mono text-lg sm:text-xl font-bold text-slate-100 mb-6">
            À qui ça sert
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
            <div className="border border-slate-600 border-l-4 border-l-sky-500 p-6 -mt-px -ml-px">
              <span className="font-mono text-xs uppercase tracking-widest text-sky-400">Citoyens</span>
              <p className="mt-2 text-lg font-semibold text-slate-100">Comprendre où va votre argent</p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                Explorez les finances de votre ville, sans jargon comptable.
                Votez en connaissance de cause.
              </p>
            </div>
            <div className="border border-slate-600 border-l-4 border-l-orange-500 p-6 -mt-px -ml-px">
              <span className="font-mono text-xs uppercase tracking-widest text-orange-400">Journalistes & analystes</span>
              <p className="mt-2 text-lg font-semibold text-slate-100">Des données prêtes à l&apos;emploi</p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                Données déjà modélisées et structurées. Concentrez-vous
                sur l&apos;analyse, pas sur le nettoyage de fichiers Excel.
              </p>
            </div>
            <div className="border border-slate-600 border-l-4 border-l-fuchsia-500 p-6 -mt-px -ml-px">
              <span className="font-mono text-xs uppercase tracking-widest text-fuchsia-400">Institutions publiques</span>
              <p className="mt-2 text-lg font-semibold text-slate-100">Pipelines réutilisables</p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                Réutilisez les pipelines de transformation pour votre propre
                infrastructure data. Code ouvert, standards documentés.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ——— MANIFESTO ——— */}
      <section className="border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <p className="text-base sm:text-lg text-slate-300 max-w-3xl leading-relaxed">
            <strong className="text-slate-100">Données Lumières</strong> est un projet
            citoyen, indépendant de tout parti et de la Mairie de Paris.
            Comprendre les comptes de sa ville ne devrait pas nécessiter un diplôme
            de comptabilité publique.
          </p>
          <p className="mt-6 text-sm text-slate-400">
            <a
              href="https://github.com/Nuttux/france-open-data"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-200"
            >
              GitHub
            </a>
            {' · '}
            <Link href="/blog" className="underline hover:text-slate-200">
              Blog
            </Link>
            {' · '}
            <a
              href="mailto:hi@franceopendata.org"
              className="underline hover:text-slate-200"
            >
              Contactez-nous
            </a>
          </p>
        </div>
      </section>

      {/* ——— 4. FOOTER ——— */}
      <footer className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs text-slate-500 font-mono">
            <a href="https://opendata.paris.fr/" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300">Sources</a>
            {' · '}
            <span>Licence MIT</span>
            {' · '}
            <a href="https://github.com/Nuttux/france-open-data" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300">GitHub</a>
          </p>
        </div>
      </footer>
    </main>
  );
}
