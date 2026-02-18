'use client';

/**
 * MarchesAnnuelTab — Wrapper Marchés publics pour le composant partagé AnnuelTab.
 *
 * Breakdown : Nature (Services/Travaux/Fournitures), Catégorie d'achat.
 * Table preview : top 30 marchés par enveloppe.
 *
 * ATTENTION : Les montants sont des ENVELOPPES PLURIANNUELLES, pas des dépenses annuelles.
 */

import { useMemo } from 'react';
import AnnuelTab from '@/components/shared/AnnuelTab';
import type { BreakdownOption, TableColumnDef } from '@/components/shared/AnnuelTab';
import type { MarchePublic } from '@/components/MarchesTable';
import { NATURE_LABELS } from '@/components/MarchesFilters';
import ExportBar from '@/components/shared/ExportBar';
import type { CsvColumn } from '@/lib/export';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { PALETTE } from '@/lib/colors';
import { BREAKDOWN_ICONS } from '@/lib/icons';

const CSV_COLUMNS: CsvColumn<Record<string, unknown>>[] = [
  { key: 'numero_marche', label: 'N° marché' },
  { key: 'objet', label: 'Objet' },
  { key: 'nature', label: 'Nature' },
  { key: 'categorie_libelle', label: 'Catégorie' },
  { key: 'fournisseur_nom', label: 'Fournisseur' },
  { key: 'fournisseur_siret', label: 'SIRET fournisseur' },
  { key: 'montant_max', label: 'Enveloppe max (€)' },
  { key: 'date_notification', label: 'Date notification' },
  { key: 'duree_jours', label: 'Durée (jours)' },
  { key: 'is_multiattributaire', label: 'Multi-attributaire', format: (v) => v ? 'Oui' : 'Non' },
];

// ─── Config ──────────────────────────────────────────────────────────────────

const BREAKDOWNS: BreakdownOption[] = [
  { id: 'nature', label: 'Nature', icon: BREAKDOWN_ICONS.nature },
  { id: 'categorie', label: 'Catégorie', icon: BREAKDOWN_ICONS.categorie },
];

/** Couleurs fixes par nature de marché */
const NATURE_COLOR_MAP: Record<string, string> = {
  'SERVICES': PALETTE.blue,
  'TRAVAUX': PALETTE.orange,
  'FOURNITURE': PALETTE.amber,
};

const DIM_COLORS = [
  PALETTE.cyan, PALETTE.purple, PALETTE.amber, PALETTE.blue,
  PALETTE.pink, PALETTE.green, PALETTE.orange, PALETTE.red,
  PALETTE.teal, PALETTE.emerald, PALETTE.violet, PALETTE.rose,
  PALETTE.sky, PALETTE.lime, PALETTE.yellow, PALETTE.slate,
  PALETTE.cyan, PALETTE.purple, PALETTE.amber, PALETTE.blue,
  PALETTE.pink, PALETTE.green,
];

function getGroupKey(m: MarchePublic, dim: string): string {
  switch (dim) {
    case 'nature':
      return m.nature || 'Non renseigné';
    case 'categorie':
      return m.categorie_libelle || 'Non renseigné';
    default:
      return 'Autre';
  }
}

function getGroupColor(key: string, dim: string, index: number): string {
  if (key === 'Autres') return PALETTE.slate;
  if (dim === 'nature') return NATURE_COLOR_MAP[key] || PALETTE.slate;
  return DIM_COLORS[index % DIM_COLORS.length];
}

function formatDuration(days: number | null): string {
  if (!days) return '-';
  if (days < 365) return `${days}j`;
  const years = Math.floor(days / 365);
  const rem = days % 365;
  if (rem < 30) return `${years}a`;
  const months = Math.round(rem / 30);
  return `${years}a ${months}m`;
}

/** Nettoie les objets de marchés publics pour un affichage lisible */
function cleanObjet(raw: string): string {
  let text = raw;
  // Strip leading internal codes: SA3_ACMS_TVX, SA3.AC_MS.TVX, SA4_ACMS_L1:, SA3_ACBC, etc.
  text = text.replace(/^SA\d+[._\s-][\w._-]+[\s:]+/i, '');
  // Handle "SA3 ACMS TRVX_" style (space-separated prefix)
  text = text.replace(/^SA\d+\s+\w+\s+\w+[_\s]+/i, '');
  // Strip orphan lot number prefix after code removal: "2 : ..."
  text = text.replace(/^\d+\s*:\s*/, '');
  // Replace underscores with spaces
  text = text.replace(/_/g, ' ');
  // Clean multiple spaces
  text = text.replace(/\s+/g, ' ').trim();
  // Sentence case
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }
  return text || raw;
}

const COLUMNS: TableColumnDef<MarchePublic>[] = [
  {
    key: 'objet', label: 'Marché', align: 'left',
    render: (m, i) => (
      <div className="flex items-start gap-2">
        <span className="text-slate-500 text-xs w-5 shrink-0 pt-0.5">{i + 1}</span>
        <div className="min-w-0">
          <p className="text-xs md:text-sm font-medium text-slate-200 line-clamp-2">
            {m.categorie_libelle || cleanObjet(m.objet)}
          </p>
          <p className="text-[10px] md:text-xs text-slate-500 mt-0.5 line-clamp-1" title={m.objet}>
            {cleanObjet(m.objet)}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: NATURE_COLOR_MAP[m.nature] || '#64748b' }}
            />
            <span className="text-[10px] text-slate-500">
              {NATURE_LABELS[m.nature] || m.nature}
              {m.duree_jours ? ` · ${formatDuration(m.duree_jours)}` : ''}
            </span>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'fournisseur', label: 'Fournisseur', hideOnMobile: true, align: 'left',
    render: (m) => m.is_multiattributaire
      ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-900/30 text-amber-400">Multi-attr.</span>
      : <p className="text-xs text-slate-600 line-clamp-2">{m.fournisseur_nom}</p>,
  },
  {
    key: 'montant', label: 'Enveloppe max', align: 'right',
    render: (m) => <p className="text-xs md:text-sm font-semibold text-teal-400 whitespace-nowrap">{formatEuroCompact(m.montant_max)}</p>,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface MarchesAnnuelTabProps {
  selectedYear: number;
  marches: MarchePublic[];
  isLoading: boolean;
  error: string | null;
  onNavigateExplorer?: () => void;
}

export default function MarchesAnnuelTab({
  selectedYear, marches, isLoading, error, onNavigateExplorer,
}: MarchesAnnuelTabProps) {
  const stats = useMemo(() => {
    if (marches.length === 0) return null;

    const totalEnveloppe = marches.reduce((s, m) => s + m.montant_max, 0);
    const sorted = [...marches].sort((a, b) => b.montant_max - a.montant_max);
    const median = sorted[Math.floor(sorted.length / 2)].montant_max;

    // Durée moyenne (hors nulls)
    const withDuration = marches.filter((m) => m.duree_jours && m.duree_jours > 0);
    const dureeMoyenne = withDuration.length > 0
      ? Math.round(withDuration.reduce((s, m) => s + m.duree_jours!, 0) / withDuration.length)
      : null;

    // Fournisseurs uniques (hors multi-attributaires)
    const fournisseurTotals: Record<string, number> = {};
    let multiAttrCount = 0;
    for (const m of marches) {
      if (m.is_multiattributaire) {
        multiAttrCount++;
      } else {
        fournisseurTotals[m.fournisseur_nom] = (fournisseurTotals[m.fournisseur_nom] || 0) + m.montant_max;
      }
    }
    const fournisseursUniques = Object.keys(fournisseurTotals).length;
    const tauxMultiAttr = marches.length > 0 ? (multiAttrCount / marches.length) * 100 : 0;
    const topFournisseur = Object.entries(fournisseurTotals).sort((a, b) => b[1] - a[1])[0];

    return {
      total: marches.length,
      totalEnveloppe,
      median,
      dureeMoyenne,
      fournisseursUniques,
      tauxMultiAttr,
      topFournisseurName: topFournisseur?.[0] || '-',
      topFournisseurVal: topFournisseur?.[1] || 0,
    };
  }, [marches]);

  return (
    <AnnuelTab
      items={marches}
      isLoading={isLoading}
      theme="teal"
      breakdowns={BREAKDOWNS}
      getGroupKey={getGroupKey}
      getGroupColor={getGroupColor}
      getValue={(m) => m.montant_max}
      treemapTitle="Répartition des marchés publics"
      tooltipCountLabel="Marchés"
      maxGroups={(dim) => dim === 'categorie' ? 8 : undefined}
      itemLabel="marchés"
      columns={COLUMNS}
      sortItems={(a, b) => b.montant_max - a.montant_max}
      getItemKey={(m, i) => `${m.numero_marche}-${i}`}
      onNavigateExplorer={onNavigateExplorer}
      exportBar={
        <ExportBar
          csvData={marches as unknown as Record<string, unknown>[]}
          csvColumns={CSV_COLUMNS}
          filename={`marches_publics_${selectedYear}`}
        />
      }
      banner={
        <>
          <div className="bg-teal-900/30 border border-teal-500/30 rounded-lg p-3 mb-6">
            <p className="text-xs text-teal-300/80">
              Les montants affichés sont des <strong className="text-teal-200">enveloppes pluriannuelles</strong> (plafonds contractuels), pas des dépenses annuelles. 97% des marchés sont des accords-cadres.
            </p>
          </div>
          {error && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-4 mb-6">
              <p className="text-red-400 flex items-center gap-2"><span>⚠</span>{error}</p>
            </div>
          )}
        </>
      }
      kpiCards={stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Enveloppe totale</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{formatEuroCompact(stats.totalEnveloppe)}</p>
            <p className="text-xs text-slate-500 mt-1">{formatNumber(stats.total)} marchés notifiés</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Enveloppe médiane</p>
            <p className="text-2xl font-bold text-teal-400 mt-1">{formatEuroCompact(stats.median)}</p>
            <p className="text-xs text-slate-500 mt-1">par marché</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Durée moyenne</p>
            <p className="text-2xl font-bold text-teal-400 mt-1">{stats.dureeMoyenne ? formatDuration(stats.dureeMoyenne) : '—'}</p>
            <p className="text-xs text-slate-500 mt-1">par contrat</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Fournisseurs uniques</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{formatNumber(stats.fournisseursUniques)}</p>
            <p className="text-xs text-slate-500 mt-1">hors multi-attr.</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Multi-attributaires</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{stats.tauxMultiAttr.toFixed(0)}%</p>
            <p className="text-xs text-slate-500 mt-1">des marchés</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Top fournisseur</p>
            <p className="text-lg font-bold text-emerald-400 mt-1 truncate" title={stats.topFournisseurName}>
              {formatEuroCompact(stats.topFournisseurVal)}
            </p>
            <p className="text-xs text-slate-500 mt-1 truncate" title={stats.topFournisseurName}>
              {stats.topFournisseurName.slice(0, 30)}
            </p>
          </div>
        </div>
      )}
    />
  );
}
