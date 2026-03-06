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
import { useLocale, useT } from '@/lib/localeContext';
import { NAV_ICONS } from '@/lib/icons';
import { useTrack } from '@/lib/analyticsContext';

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
const NAV_LINK_DEFS = [
  {
    href: '/',
    labelKey: 'nav.accueil',
    shortLabelKey: 'nav.accueil.short',
    descKey: 'nav.accueil.desc',
    icon: NAV_ICONS.accueil,
    activeColor: 'text-slate-100',
    activeBg: 'bg-slate-700/30 border-slate-500/30',
  },
  {
    href: '/tableau-de-bord',
    labelKey: 'nav.synthese',
    shortLabelKey: 'nav.synthese.short',
    descKey: 'nav.synthese.desc',
    icon: NAV_ICONS.synthese,
    activeColor: 'text-blue-400',
    activeBg: 'bg-blue-600/20 border-blue-500/30',
  },
  {
    href: '/budget',
    labelKey: 'nav.budget',
    shortLabelKey: 'nav.budget.short',
    descKey: 'nav.budget.desc',
    icon: NAV_ICONS.budget,
    activeColor: 'text-rose-400',
    activeBg: 'bg-rose-600/20 border-rose-500/30',
  },
  {
    href: '/patrimoine',
    labelKey: 'nav.patrimoine',
    shortLabelKey: 'nav.patrimoine.short',
    descKey: 'nav.patrimoine.desc',
    icon: NAV_ICONS.patrimoine,
    activeColor: 'text-violet-400',
    activeBg: 'bg-violet-600/20 border-violet-500/30',
  },
  {
    href: '/subventions',
    labelKey: 'nav.subventions',
    shortLabelKey: 'nav.subventions.short',
    descKey: 'nav.subventions.desc',
    icon: NAV_ICONS.subventions,
    activeColor: 'text-amber-400',
    activeBg: 'bg-amber-600/20 border-amber-500/30',
  },
  {
    href: '/investissements',
    labelKey: 'nav.investissements',
    shortLabelKey: 'nav.investissements.short',
    descKey: 'nav.investissements.desc',
    icon: NAV_ICONS.investissements,
    activeColor: 'text-purple-400',
    activeBg: 'bg-purple-600/20 border-purple-500/30',
  },
  {
    href: '/marches-publics',
    labelKey: 'nav.marches',
    shortLabelKey: 'nav.marches.short',
    descKey: 'nav.marches.desc',
    icon: NAV_ICONS.marches,
    activeColor: 'text-orange-400',
    activeBg: 'bg-orange-600/20 border-orange-500/30',
  },
  {
    href: '/logements',
    labelKey: 'nav.logements',
    shortLabelKey: 'nav.logements.short',
    descKey: 'nav.logements.desc',
    icon: NAV_ICONS.logements,
    activeColor: 'text-cyan-400',
    activeBg: 'bg-cyan-600/20 border-cyan-500/30',
  },
  {
    href: '/blog',
    labelKey: 'nav.blog',
    shortLabelKey: 'nav.blog.short',
    descKey: 'nav.blog.desc',
    icon: NAV_ICONS.blog,
    activeColor: 'text-slate-100',
    activeBg: 'bg-slate-700/30 border-slate-500/30',
  },
] as const;

/**
 * FR / EN locale toggle — plain text, brutalist style
 */
function LocaleToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono ${className}`}>
      <button
        type="button"
        onClick={() => setLocale('fr')}
        className={`px-1 py-0.5 rounded transition-colors ${locale === 'fr' ? 'text-slate-100 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
      >
        FR
      </button>
      <span className="text-slate-600">·</span>
      <button
        type="button"
        onClick={() => setLocale('en')}
        className={`px-1 py-0.5 rounded transition-colors ${locale === 'en' ? 'text-slate-100 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
      >
        EN
      </button>
    </span>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const track = useTrack();
  const t = useT();

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
                {t('nav.site_title')}
              </h1>
            </Link>

            {/* Liens de navigation desktop */}
            <div className="flex items-center gap-0.5">
              {NAV_LINK_DEFS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => track('nav_click', { destination: link.href, nav_type: 'desktop_top' })}
                    className={`
                      flex items-center gap-1.5 px-2 lg:px-2.5 py-2 rounded-lg text-xs font-medium
                      transition-all duration-200 ${link.activeColor}
                      ${
                        isActive
                          ? `${link.activeBg} border`
                          : 'opacity-70 hover:opacity-100 hover:bg-slate-800/50'
                      }
                    `}
                    title={t(link.descKey)}
                  >
                    <span className="text-[18px] leading-none">{link.icon}</span>
                    <span className="hidden lg:inline">{t(link.labelKey)}</span>
                  </Link>
                );
              })}

              <LocaleToggle className="ml-2" />
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
              {t('nav.site_title')}
            </h1>
          </Link>

          <LocaleToggle />
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════
          MOBILE : Barre de navigation fixe en bas (tab bar)
          9 onglets avec icône + label compact dans une grille CSS
          Compatible safe-area pour iPhone X+ (home indicator)
          ═══════════════════════════════════════════════════════════ */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-md border-t border-slate-700/50"
        role="tablist"
        aria-label={t('nav.main_aria')}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid grid-cols-9">
          {NAV_LINK_DEFS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                role="tab"
                aria-selected={isActive}
                onClick={() => track('nav_click', { destination: link.href, nav_type: 'mobile_bottom' })}
                className={`
                  relative flex flex-col items-center justify-center py-2
                  transition-colors duration-200
                  ${
                    isActive
                      ? link.activeColor
                      : 'text-slate-400 active:text-slate-200'
                  }
                `}
              >
                {isActive && (
                  <span className={`absolute top-0 inset-x-2 h-0.5 ${link.activeColor.replace('text-', 'bg-')} rounded-full`} />
                )}
                <span className="text-[20px] leading-none">
                  {link.icon}
                </span>
                <span
                  className={`
                    text-[9px] mt-1 leading-tight font-medium
                    max-w-full px-0.5 text-center
                    ${isActive ? link.activeColor : 'text-slate-400'}
                  `}
                >
                  {t(link.shortLabelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
