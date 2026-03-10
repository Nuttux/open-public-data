'use client';

import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { useMemo } from 'react';
import { CITIES } from '@/lib/constants/cities';
import type { BenchmarkingData } from '@/lib/types/villes';
import { formatEuroCompact } from '@/lib/formatters';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';
import { useT } from '@/lib/localeContext';

interface Props {
  data: BenchmarkingData;
  selectedYear: number | null;
}

export default function BenchmarkingBars({ data, selectedYear }: Props) {
  const isMobile = useIsMobile(BREAKPOINTS.md);
  const t = useT();

  const option: EChartsOption = useMemo(() => {
    if (!selectedYear) return {};

    const categories = [t('villes.bench_recettes'), t('villes.bench_depenses'), t('villes.bench_investissement'), t('villes.bench_dette')];

    const series = CITIES.map((cityMeta) => {
      const cityData = data.cities.find((c) => c.slug === cityMeta.slug);
      const kpis = cityData?.years[String(selectedYear)];

      return {
        name: cityMeta.name,
        type: 'bar' as const,
        data: [
          kpis?.recettes_fonctionnement ?? 0,
          kpis?.depenses_fonctionnement ?? 0,
          kpis?.depenses_investissement ?? 0,
          kpis?.encours_dette ?? 0,
        ],
        itemStyle: { color: cityMeta.color },
        barMaxWidth: 20,
      };
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (!Array.isArray(params)) return '';
          const title = params[0]?.axisValue ?? '';
          const lines = params
            .filter((p: { value: number }) => p.value > 0)
            .map((p: { marker: string; seriesName: string; value: number }) =>
              `${p.marker} ${p.seriesName}: <b>${formatEuroCompact(p.value)}</b>`
            )
            .join('<br/>');
          return `<div style="padding:4px"><b>${title}</b><br/>${lines}</div>`;
        },
      },
      legend: {
        bottom: 0,
        textStyle: { color: '#94a3b8', fontSize: isMobile ? 10 : 12 },
        itemWidth: 14,
        itemHeight: 8,
      },
      grid: {
        left: isMobile ? 60 : 80,
        right: 20,
        top: 20,
        bottom: 60,
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: { color: '#94a3b8', fontSize: isMobile ? 10 : 12 },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (value: any) => formatEuroCompact(value as number),
        },
        splitLine: { lineStyle: { color: '#334155' } },
      },
      series,
    };
  }, [data, selectedYear, isMobile, t]);

  return (
    <ReactECharts
      option={option}
      style={{ height: isMobile ? '300px' : '400px', width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
}
