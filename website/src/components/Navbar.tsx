'use client';

/**
 * Navbar - Navigation responsive du dashboard
 *
 * Structure responsive :
 * - Desktop (md+) : Barre horizontale en haut avec logo, liens texte et bouton glossaire
 * - Mobile  (<md) : Barre compacte en haut (logo + glossaire) + barre de navigation
 *   fixe en bas avec icônes et labels pour toutes les pages
 *
 * La barre mobile en bas utilise env(safe-area-inset-bottom) pour les
 * appareils avec zone d'accueil (iPhone X+).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGlossary } from '@/lib/glossaryContext';
import { NAV_ICONS } from '@/lib/icons';

/**
 * Configuration des liens de navigation
 * Chaque entrée définit une page du dashboard avec son icône et son label
 */
/**
 * Navigation links — Entity-based architecture.
 *
 * Legacy redirects configured in next.config.ts:
 *   /evolution → /budget?tab=tendances
 *   /prevision → /budget?tab=prevision
 *   /bilan     → /patrimoine?tab=annuel
 *   /carte     → /logements?tab=carte
 */
const navLinks = [
  {
    href: '/',
    label: 'Accueil',
    icon: NAV_ICONS.accueil,
    description: 'Présentation du projet',
  },
  {
    href: '/budget',
    label: 'Budget',
    icon: NAV_ICONS.budget,
    description: 'Budget de Paris — Annuel, Tendances, Prévision',
  },
  {
    href: '/patrimoine',
    label: 'Patrimoine',
    icon: NAV_ICONS.patrimoine,
    description: 'État patrimonial, dette et santé financière',
  },
  {
    href: '/subventions',
    label: 'Subventions',
    icon: NAV_ICONS.subventions,
    description: 'Bénéficiaires par thématique',
  },
  {
    href: '/investissements',
    label: 'Travaux',
    icon: NAV_ICONS.investissements,
    description: "Projets d'investissement",
  },
  {
    href: '/logements',
    label: 'Logements',
    icon: NAV_ICONS.logements,
    description: 'Logements sociaux financés',
  },
  {
    href: '/blog',
    label: 'Blog',
    icon: NAV_ICONS.blog,
    description: 'Articles et analyses',
  },
];

/**
 * Bouton glossaire réutilisable pour desktop et mobile
 * Ouvre le tiroir glossaire avec les définitions des termes budgétaires
 */
function GlossaryButton({
  onClick,
  className = '',
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center justify-center rounded-lg
        border border-slate-700/50 text-slate-400
        hover:text-slate-200 hover:bg-slate-800/50
        transition-all duration-200
        ${className}
      `}
      title="Comprendre les chiffres"
      aria-label="Ouvrir le glossaire des termes budgétaires"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </button>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const { openFull } = useGlossary();

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          DESKTOP : Barre de navigation horizontale en haut
          Visible uniquement sur md+ (768px+)
          ═══════════════════════════════════════════════════════════ */}
      <nav className="hidden md:block bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo / Titre */}
            <Link
              href="/"
              className="flex items-center gap-3 hover:opacity-80 transition-opacity shrink-0"
            >
              <h1 className="text-lg font-bold text-slate-100">
                Données Lumières
              </h1>
            </Link>

            {/* Liens de navigation desktop */}
            <div className="flex items-center gap-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                      transition-all duration-200
                      ${
                        isActive
                          ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }
                    `}
                    title={link.description}
                  >
                    <span className="text-lg">{link.icon}</span>
                    <span className="hidden lg:inline">{link.label}</span>
                  </Link>
                );
              })}

              <GlossaryButton onClick={openFull} className="w-9 h-9 ml-2" />
            </div>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════
          MOBILE : Barre compacte en haut (logo + glossaire)
          Visible uniquement sous md (< 768px)
          ═══════════════════════════════════════════════════════════ */}
      <header className="md:hidden bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
        <div className="flex items-center justify-between h-12 px-4">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <h1 className="text-base font-bold text-slate-100">
              Données Lumières
            </h1>
          </Link>

          <GlossaryButton onClick={openFull} className="w-8 h-8" />
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════
          MOBILE : Barre de navigation fixe en bas (tab bar)
          7 onglets avec icône + label compact dans une grille CSS
          Compatible safe-area pour iPhone X+ (home indicator)
          ═══════════════════════════════════════════════════════════ */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-md border-t border-slate-700/50"
        role="tablist"
        aria-label="Navigation principale"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid grid-cols-7">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                role="tab"
                aria-selected={isActive}
                className={`
                  relative flex flex-col items-center justify-center py-2
                  transition-colors duration-200
                  ${
                    isActive
                      ? 'text-purple-400'
                      : 'text-slate-500 active:text-slate-300'
                  }
                `}
              >
                {/* Indicateur actif — barre violette en haut de l'onglet */}
                {isActive && (
                  <span className="absolute top-0 inset-x-2 h-0.5 bg-purple-400 rounded-full" />
                )}
                <span className="text-[22px] leading-none">
                  {link.icon}
                </span>
                <span
                  className={`
                    text-[9px] mt-1 leading-tight font-medium
                    truncate max-w-full px-0.5 text-center
                    ${isActive ? 'text-purple-400' : 'text-slate-500'}
                  `}
                >
                  {link.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
