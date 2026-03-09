'use client';

/**
 * ExportBar — Barre d'export CSV + lien + impression.
 *
 * Desktop uniquement (masquée sur mobile).
 * Positionnée en haut à droite des zones de contenu d'onglet.
 */

import { useState, useCallback } from 'react';
import { arrayToCSV, downloadCSV, copyShareLink } from '@/lib/export';
import type { CsvColumn } from '@/lib/export';
import { useT } from '@/lib/localeContext';

interface ExportBarProps<T extends Record<string, unknown>> {
  /** Data rows to export */
  csvData: T[];
  /** Column definitions for CSV */
  csvColumns: CsvColumn<T>[];
  /** Filename (without .csv extension) */
  filename: string;
}

export default function ExportBar<T extends Record<string, unknown>>({
  csvData,
  csvColumns,
  filename,
}: ExportBarProps<T>) {
  const t = useT();
  const [linkCopied, setLinkCopied] = useState(false);

  const handleDownload = useCallback(() => {
    if (csvData.length === 0) return;
    const csv = arrayToCSV(csvData, csvColumns);
    downloadCSV(csv, filename);
  }, [csvData, csvColumns, filename]);

  const handleCopyLink = useCallback(async () => {
    const ok = await copyShareLink();
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="hidden md:flex items-center justify-end gap-2 mb-3">
      {/* CSV */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={csvData.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-100 bg-slate-800/50 hover:bg-slate-900 border border-slate-700/50 rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        title={t('export.csv_title')}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        CSV
      </button>

      {/* Lien */}
      <button
        type="button"
        onClick={handleCopyLink}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-100 bg-slate-800/50 hover:bg-slate-900 border border-slate-700/50 rounded-lg transition-all duration-200"
        title={t('export.copy_link')}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        {linkCopied ? t('export.copied') : t('export.link')}
      </button>

      {/* PDF (impression) */}
      <button
        type="button"
        onClick={handlePrint}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-100 bg-slate-800/50 hover:bg-slate-900 border border-slate-700/50 rounded-lg transition-all duration-200"
        title={t('export.pdf_title')}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        PDF
      </button>
    </div>
  );
}
