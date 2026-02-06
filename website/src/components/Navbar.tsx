'use client';

/**
 * Composant Navbar - Navigation globale du dashboard
 * 
 * Permet de naviguer entre:
 * - Landing (présentation du projet)
 * - Dashboard Sankey (page principale)
 * - Évolution temporelle
 * - Subventions (treemap + table bénéficiaires)
 * - Investissements/Travaux (projets avec toggle liste/carte)
 * - Carte interactive (logements sociaux)
 * - Blog (articles et analyses)
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Configuration des liens de navigation
 */
const navLinks = [
  {
    href: '/',
    label: 'Accueil',
    icon: '🏠',
    description: 'Présentation du projet',
  },
  {
    href: '/budget',
    label: 'Budget',
    icon: '📊',
    description: 'Flux budgétaires (Sankey)',
  },
  {
    href: '/evolution',
    label: 'Évolution',
    icon: '📈',
    description: 'Analyse temporelle',
  },
  {
    href: '/subventions',
    label: 'Subventions',
    icon: '💰',
    description: 'Bénéficiaires par thématique',
  },
  {
    href: '/investissements',
    label: 'Travaux',
    icon: '🏗️',
    description: 'Projets d\'investissement',
  },
  {
    href: '/carte',
    label: 'Carte',
    icon: '🗺️',
    description: 'Vue géographique (logements)',
  },
  {
    href: '/blog',
    label: 'Blog',
    icon: '📝',
    description: 'Articles et analyses',
  },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Titre */}
          <Link 
            href="/" 
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <span className="text-2xl">🏛️</span>
            <div>
              <h1 className="text-lg font-bold text-slate-100">Données Lumières</h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                Open Data pour la démocratie
              </p>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    transition-all duration-200
                    ${isActive 
                      ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }
                  `}
                  title={link.description}
                >
                  <span className="text-lg">{link.icon}</span>
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
