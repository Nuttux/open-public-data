'use client';

import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { useMemo } from 'react';
import { CITIES } from '@/lib/constants/cities';
import type { BenchmarkingData, CityKPIs } from '@/lib/types/villes';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

interface Props {
  data: BenchmarkingData;
  selectedYear: number | null;
}

const RADAR_METRICS: { key: keyof CityKPIs; label: string }[] = [
  { key: 'recettes_par_hab', label: 'Recettes/hab' },
  { key: 'depenses_par_hab', label: 'Dépenses/hab' },
  { key: 'dette_par_hab', label: 'Dette/hab' },
  { key: 'investissement_par_hab', label: 'Invest./hab' },
  { key: 'personnel_par_hab', label: 'Personnel/hab' },
  { key: 'fiscalite_par_hab', label: 'Fiscalité/hab' },
];

export default function BenchmarkingRadar({ data, selectedYear }: Props) {
  const isMobile = useIsMobile(BREAKPOINTS.md);

  const option: EChartsOption = useMemo(() => {
    if (!selectedYear) return {};

    // Find max values for each metric to normalize
    const maxValues = RADAR_METRICS.map((metric) => {
      return Math.max(
        ...data.cities.map((city) => {
          const kpis = city.years[String(selectedYear)];
          return (kpis?.[metric.key] as number) ?? 0;
        }),
        1
      );
    });

    const indicator = RADAR_METRICS.map((metric, i) => ({
      name: metric.label,
      max: maxValues[i] * 1.1,
    }));

    const series = CITIES.map((cityMeta) => {
      const cityData = data.cities.find((c) => c.slug === cityMeta.slug);
      const kpis = cityData?.years[String(selectedYear)];

      const values = RADAR_METRICS.map((metric) => {
        return (kpis?.[metric.key] as number) ?? 0;
      });

      return {
        name: cityMeta.name,
        value: values,
        lineStyle: { color: cityMeta.color, width: 2 },
        areaStyle: { color: cityMeta.color, opacity: 0.05 },
        itemStyle: { color: cityMeta.color },
        symbol: 'circle',
        symbolSize: 4,
      };
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0' },
      },
      legend: {
        bottom: 0,
        textStyle: { color: '#94a3b8', fontSize: isMobile ? 10 : 12 },
        itemWidth: 14,
        itemHeight: 8,
        data: CITIES.map((c) => c.name),
      },
      radar: {
        indicator,
        shape: 'polygon',
        radius: isMobile ? '55%' : '65%',
        center: ['50%', '45%'],
        splitNumber: 4,
        axisName: {
          color: '#94a3b8',
          fontSize: isMobile ? 9 : 11,
        },
        splitArea: { areaStyle: { color: ['transparent'] } },
        splitLine: { lineStyle: { color: '#334155' } },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      series: [
        {
          type: 'radar',
          data: series,
        },
      ],
    };
  }, [data, selectedYear, isMobile]);

  return (
    <ReactECharts
      option={option}
      style={{ height: isMobile ? '320px' : '400px', width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
}
