'use client';

/**
 * SubventionsExplorerTab — Onglet "Explorer" de /subventions.
 *
 * Contrairement à Travaux et Logements, les subventions n'ont pas de données
 * géographiques : il n'y a donc PAS de toggle Liste/Carte.
 * Seule une vue « Liste de bénéficiaires » est affichée avec une sidebar de
 * filtres (desktop) ou des filtres collapsibles (mobile).
 *
 * Sources : données chargées par le parent et transmises en props.
 */

import { useState, useMemo } from 'react';
import SubventionsTable, { type Beneficiaire } from '@/components/SubventionsTable';
import { type SubventionFilters, DEFAULT_FILTERS } from '@/components/SubventionsFilters';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Mapping nature → type simplifié */
const NATURE_TO_TYPE: Record<string, string> = {
  'Associations': 'association',
  'Etablissements publics': 'public',
  'Etablissements de droit public': 'public',
  'Autres personnes de droit public': 'public',
  'Etat': 'public',
  'Communes': 'public',
  'Département': 'public',
  'Régions': 'public',
  'Entreprises': 'entreprise',
  'Autres personnes de droit privé': 'prive_autre',
  'Personnes physiques': 'personne_physique',
  'Autres': 'autre',
};

const TYPE_LABELS: Record<string, string> = {
  'association': 'Associations',
  'public': 'Établissements publics',
  'entreprise': 'Entreprises',
  'personne_physique': 'Personnes physiques',
  'prive_autre': 'Autres privés',
  'autre': 'Autres',
};

const MONTANT_RANGES = [
  { min: 0, max: 0, label: 'Tous les montants' },
  { min: 0, max: 100000, label: 'Moins de 100 k€' },
  { min: 100000, max: 1000000, label: '100 k€ à 1 M€' },
  { min: 1000000, max: 10000000, label: '1 M€ à 10 M€' },
  { min: 10000000, max: 100000000, label: '10 M€ à 100 M€' },
  { min: 100000000, max: 0, label: 'Plus de 100 M€' },
];

interface SubventionsExplorerTabProps {
  /** Liste des bénéficiaires */
  beneficiaires: Beneficiaire[];
  /** Directions disponibles */
  availableDirections: string[];
  /** Chargement en cours */
  isLoading: boolean;
}

// ─── Filter Panel ────────────────────────────────────────────────────────────

function FilterPanel({
  filters, onFiltersChange, availableDirections, beneficiaires, activeFilterCount, onReset, layout,
}: {
  filters: SubventionFilters; onFiltersChange: (f: SubventionFilters) => void;
  availableDirections: string[]; beneficiaires: Beneficiaire[];
  activeFilterCount: number; onReset: () => void; layout: 'sidebar' | 'inline';
}) {
  const isVertical = layout === 'sidebar';

  const thematiques = useMemo(() => {
    const set = new Set(beneficiaires.map(b => b.thematique));
    return Array.from(set).sort();
  }, [beneficiaires]);

  return (
    <div className={isVertical ? 'space-y-4' : 'grid grid-cols-1 sm:grid-cols-3 gap-4'}>
      {/* Recherche */}
      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Rechercher</label>
        <input
          type="text" value={filters.search}
          onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Nom, SIRET..."
          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
        />
      </div>

      {/* Type d'organisme */}
      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-2">Type d&apos;organisme</label>
        <div className={isVertical ? 'space-y-1.5' : 'flex flex-wrap gap-1.5'}>
          {Object.entries(TYPE_LABELS).map(([type, label]) => {
            const isSelected = filters.typesOrganisme.includes(type);
            return (
              <button key={type}
                onClick={() => {
                  const updated = isSelected ? filters.typesOrganisme.filter(t => t !== type) : [...filters.typesOrganisme, type];
                  onFiltersChange({ ...filters, typesOrganisme: updated });
                }}
                className={`${isVertical ? 'w-full flex items-center justify-between px-3 py-2' : 'px-2 py-1'} rounded-md text-${isVertical ? 'sm' : '[11px]'} font-medium transition-all ${isSelected ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 'bg-slate-900/30 text-slate-400 hover:bg-slate-900/50 border border-transparent'}`}
              ><span>{label}</span></button>
            );
          })}
        </div>
      </div>

      {/* Direction + Montant + Thématique */}
      <div className={isVertical ? 'space-y-4' : ''}>
        {availableDirections.length > 0 && (
          <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Direction</label>
            <select value={filters.directions.length === 1 ? filters.directions[0] : ''}
              onChange={e => onFiltersChange({ ...filters, directions: e.target.value ? [e.target.value] : [] })}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
            >
              <option value="">Toutes les directions</option>
              {availableDirections.map(dir => <option key={dir} value={dir}>{dir}</option>)}
            </select>
          </div>
        )}

        <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : 'mt-3'}>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Montant</label>
          <select value={`${filters.montantMin}-${filters.montantMax}`}
            onChange={e => { const [min, max] = e.target.value.split('-').map(Number); onFiltersChange({ ...filters, montantMin: min, montantMax: max }); }}
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
          >
            {MONTANT_RANGES.map(r => <option key={`${r.min}-${r.max}`} value={`${r.min}-${r.max}`}>{r.label}</option>)}
          </select>
        </div>

        {/* Thématique */}
        {isVertical && (
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <label className="block text-xs font-medium text-slate-400 mb-2">Thématique</label>
            <select value={filters.thematique || ''}
              onChange={e => onFiltersChange({ ...filters, thematique: e.target.value || null })}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
            >
              <option value="">Toutes les thématiques</option>
              {thematiques.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Reset */}
      {activeFilterCount > 0 && (
        <div className={isVertical ? '' : 'sm:col-span-3 flex justify-end pt-2 border-t border-slate-700/50'}>
          <button onClick={onReset} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Réinitialiser les filtres ({activeFilterCount})
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubventionsExplorerTab({
  beneficiaires, availableDirections, isLoading,
}: SubventionsExplorerTabProps) {
  const isMobile = useIsMobile(BREAKPOINTS.lg);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<SubventionFilters>(DEFAULT_FILTERS);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.search) c++;
    if (filters.typesOrganisme.length > 0) c++;
    if (filters.directions.length > 0) c++;
    if (filters.thematique) c++;
    if (filters.montantMin > 0 || filters.montantMax > 0) c++;
    return c;
  }, [filters]);

  const filteredBenefs = useMemo(() => {
    let result = beneficiaires;
    if (filters.search) { const s = filters.search.toLowerCase(); result = result.filter(b => b.beneficiaire.toLowerCase().includes(s) || (b.siret && b.siret.includes(s))); }
    if (filters.thematique) result = result.filter(b => b.thematique === filters.thematique);
    if (filters.typesOrganisme.length > 0) { result = result.filter(b => { const type = NATURE_TO_TYPE[b.nature_juridique || ''] || 'autre'; return filters.typesOrganisme.includes(type); }); }
    if (filters.directions.length > 0) result = result.filter(b => b.direction && filters.directions.includes(b.direction));
    if (filters.montantMin > 0) result = result.filter(b => b.montant_total >= filters.montantMin);
    if (filters.montantMax > 0) result = result.filter(b => b.montant_total <= filters.montantMax);
    return result;
  }, [beneficiaires, filters]);

  const filteredMontant = useMemo(() => filteredBenefs.reduce((s, b) => s + b.montant_total, 0), [filteredBenefs]);
  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const filterProps = {
    filters, onFiltersChange: setFilters, availableDirections, beneficiaires,
    activeFilterCount, onReset: resetFilters,
  };

  const ContentView = isLoading ? (
    <div className="h-64 flex items-center justify-center">
      <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ) : (
    <SubventionsTable data={beneficiaires} filters={filters} isLoading={false} pageSize={50} />
  );

  return (
    <div>
      {/* Toolbar : summary */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-slate-100">
          {formatNumber(filteredBenefs.length)} bénéficiaires
          <span className="text-sm font-normal text-slate-400 ml-2">({formatEuroCompact(filteredMontant)})</span>
        </h3>
      </div>

      {/* Mobile : collapsible filters */}
      {isMobile && (
        <>
          <button onClick={() => setMobileFiltersOpen(p => !p)}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-all border mb-4 ${mobileFiltersOpen ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' : activeFilterCount > 0 ? 'bg-purple-500/5 text-purple-300/80 border-purple-500/20 hover:border-purple-500/40' : 'bg-slate-800/50 text-slate-300 border-slate-700 hover:border-slate-500'}`}
          >
            <div className="flex items-center gap-2">
              <svg className={`w-4 h-4 transition-transform ${mobileFiltersOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>{activeFilterCount > 0 ? `Filtres (${activeFilterCount} actif${activeFilterCount > 1 ? 's' : ''})` : 'Filtrer les bénéficiaires'}</span>
            </div>
            <svg className={`w-4 h-4 transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {mobileFiltersOpen && (
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 mb-4">
              <FilterPanel {...filterProps} layout="inline" />
            </div>
          )}
          {ContentView}
        </>
      )}

      {/* Desktop : sidebar + content */}
      {!isMobile && (
        <div className="grid grid-cols-4 gap-6">
          <div className="col-span-1"><FilterPanel {...filterProps} layout="sidebar" /></div>
          <div className="col-span-3">{ContentView}</div>
        </div>
      )}
    </div>
  );
}
