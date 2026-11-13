import { useMemo, useState } from 'react';
import {
  computeHistoricalPointDisplay,
  convertCurrency,
  formatMoney,
} from '../lib/taxEngine';
import {
  CountryTaxProfile,
  CurrencyCode,
  PriceHistoryPoint,
  Product,
  SourceConfig,
  TaxViewMode,
} from '../types/market';

interface PriceHistoryChartProps {
  product: Product;
  sources: SourceConfig[];
  history: PriceHistoryPoint[];
  buyerProfile: CountryTaxProfile;
  displayCurrency: CurrencyCode;
  taxMode: TaxViewMode;
}

type RangeKey = '7d' | '30d' | 'all';

export function PriceHistoryChart({
  product,
  sources,
  history,
  buyerProfile,
  displayCurrency,
  taxMode,
}: PriceHistoryChartProps) {
  const [range, setRange] = useState<RangeKey>('30d');
  const [hiddenSourceIds, setHiddenSourceIds] = useState<Record<string, boolean>>({});
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const effectiveBasis: 'gross' | 'net' = taxMode === 'net' ? 'net' : 'gross';

  const chartData = useMemo(() => {
    const productHistory = history.filter((h) => h.productId === product.id);
    const dateSet = new Set<string>();
    productHistory.forEach((p) => {
      dateSet.add(p.scrapedAt.slice(0, 10));
    });
    let sortedDates = Array.from(dateSet).sort();
    if (range === '7d') sortedDates = sortedDates.slice(-7);
    if (range === '30d') sortedDates = sortedDates.slice(-30);

    const activeSources = sources.filter(
      (s) => s.productId === product.id && !hiddenSourceIds[s.id]
    );

    const series = activeSources.map((src) => {
      const byDate = new Map<string, PriceHistoryPoint>();
      productHistory
        .filter((p) => p.sourceConfigId === src.id)
        .forEach((p) => {
          byDate.set(p.scrapedAt.slice(0, 10), p);
        });

      const values = sortedDates.map((d) => {
        const point = byDate.get(d);
        if (!point) return null;
        return computeHistoricalPointDisplay(
          point.netPriceUsd,
          src,
          buyerProfile,
          displayCurrency,
          effectiveBasis
        );
      });

      return { source: src, values };
    });

    const allNums: number[] = [];
    series.forEach((s) =>
      s.values.forEach((v) => {
        if (v !== null) allNums.push(v);
      })
    );

    const ownNetDisplay = convertCurrency(product.ownNetPrice, 'USD', displayCurrency);
    const ownDisplay =
      effectiveBasis === 'net'
        ? ownNetDisplay
        : ownNetDisplay * (1 + buyerProfile.vatRate);

    if (allNums.length > 0) {
      allNums.push(ownDisplay);
    }

    const rawMin = allNums.length ? Math.min(...allNums) : 0;
    const rawMax = allNums.length ? Math.max(...allNums) : 100;
    const pad = Math.max((rawMax - rawMin) * 0.14, 5);
    const minVal = Math.max(0, rawMin - pad);
    const maxVal = rawMax + pad;

    const histLow = allNums.length ? Math.min(...allNums.filter((n) => n !== ownDisplay)) : 0;
    const histHigh = allNums.length ? Math.max(...allNums.filter((n) => n !== ownDisplay)) : 0;

    return {
      dates: sortedDates,
      series,
      minVal,
      maxVal,
      ownDisplay,
      histLow,
      histHigh,
    };
  }, [
    product,
    sources,
    history,
    range,
    hiddenSourceIds,
    buyerProfile,
    displayCurrency,
    effectiveBasis,
  ]);

  const width = 820;
  const height = 270;
  const padLeft = 64;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getX = (idx: number) => {
    if (chartData.dates.length <= 1) return padLeft + plotW / 2;
    return padLeft + (idx / (chartData.dates.length - 1)) * plotW;
  };

  const getY = (val: number) => {
    const span = chartData.maxVal - chartData.minVal || 1;
    return padTop + plotH - ((val - chartData.minVal) / span) * plotH;
  };

  const toggleSource = (id: string) => {
    setHiddenSourceIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const productSources = sources.filter((s) => s.productId === product.id);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (t) => chartData.minVal + t * (chartData.maxVal - chartData.minVal)
  );

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Historical Price Trajectory
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Showing {effectiveBasis === 'net' ? 'Net Ex-Tax' : 'Gross Out-The-Door (Incl. Tax & Shipping)'} in {displayCurrency}
            <span className="mx-1.5" aria-hidden="true">·</span>
            Period Low: <span className="font-mono tabular-nums font-medium text-slate-700">{formatMoney(chartData.histLow || 0, displayCurrency)}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            Period High: <span className="font-mono tabular-nums font-medium text-slate-700">{formatMoney(chartData.histHigh || 0, displayCurrency)}</span>
          </p>
        </div>

        <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
          {(
            [
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
              { id: 'all', label: 'All-Time' },
            ] as const
          ).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                range === r.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive SVG Multi-Line Chart */}
      <div className="mt-4 relative overflow-x-auto">
        {chartData.dates.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-500">
            No historical scan points recorded for this SKU yet.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full min-w-[580px] h-auto select-none"
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {/* Horizontal Y gridlines */}
            {yTicks.map((tick, idx) => {
              const y = getY(tick);
              return (
                <g key={idx}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-mono tabular-nums"
                  >
                    {formatMoney(tick, displayCurrency)}
                  </text>
                </g>
              );
            })}

            {/* Own Target Benchmark Line */}
            <line
              x1={padLeft}
              y1={getY(chartData.ownDisplay)}
              x2={width - padRight}
              y2={getY(chartData.ownDisplay)}
              stroke="#0F172A"
              strokeDasharray="4 4"
              strokeWidth="1.25"
              opacity="0.55"
            />
            <text
              x={width - padRight}
              y={getY(chartData.ownDisplay) - 6}
              textAnchor="end"
              className="fill-slate-700 text-[10px] font-medium"
            >
              Your Price ({formatMoney(chartData.ownDisplay, displayCurrency)})
            </text>

            {/* Store Lines */}
            {chartData.series.map(({ source, values }) => {
              const pts: string[] = [];
              values.forEach((v, idx) => {
                if (v !== null) {
                  pts.push(`${getX(idx)},${getY(v)}`);
                }
              });
              if (pts.length === 0) return null;
              return (
                <g key={source.id}>
                  <polyline
                    fill="none"
                    stroke={source.colorToken}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={pts.join(' ')}
                  />
                  {hoveredIdx !== null && values[hoveredIdx] !== null && (
                    <circle
                      cx={getX(hoveredIdx)}
                      cy={getY(values[hoveredIdx]!)}
                      r="4"
                      fill={source.colorToken}
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                    />
                  )}
                </g>
              );
            })}

            {/* Hovered vertical crosshair */}
            {hoveredIdx !== null && (
              <line
                x1={getX(hoveredIdx)}
                y1={padTop}
                x2={getX(hoveredIdx)}
                y2={padTop + plotH}
                stroke="#94A3B8"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
            )}

            {/* X-axis labels */}
            {chartData.dates.map((dateStr, idx) => {
              const step = Math.max(1, Math.floor(chartData.dates.length / 6));
              if (idx !== 0 && idx !== chartData.dates.length - 1 && idx % step !== 0) {
                return null;
              }
              return (
                <text
                  key={dateStr}
                  x={getX(idx)}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px] font-mono tabular-nums"
                >
                  {dateStr.slice(5)}
                </text>
              );
            })}

            {/* Invisible hover columns for crisp crosshair interaction */}
            {chartData.dates.map((_, idx) => {
              const colW = plotW / Math.max(1, chartData.dates.length);
              return (
                <rect
                  key={idx}
                  x={getX(idx) - colW / 2}
                  y={padTop}
                  width={colW}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIdx(idx)}
                />
              );
            })}
          </svg>
        )}

        {/* Hovered Date Readout Bar */}
        {hoveredIdx !== null && chartData.dates[hoveredIdx] && (
          <div className="mt-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <span className="font-mono font-semibold text-slate-800 tabular-nums">
              {chartData.dates[hoveredIdx]}
            </span>
            {chartData.series.map(({ source, values }) => {
              const val = values[hoveredIdx];
              if (val === null) return null;
              return (
                <span key={source.id} className="inline-flex items-center gap-1.5 text-slate-700">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-xs"
                    style={{ backgroundColor: source.colorToken }}
                  />
                  <span>{source.storeName}:</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900">
                    {formatMoney(val, displayCurrency)}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Interactive Store Legend Toggles */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 mr-1">Sources:</span>
        {productSources.map((src) => {
          const isHidden = !!hiddenSourceIds[src.id];
          return (
            <button
              key={src.id}
              type="button"
              onClick={() => toggleSource(src.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                isHidden
                  ? 'bg-slate-50 border-slate-200 text-slate-400'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{
                  backgroundColor: isHidden ? '#CBD5E1' : src.colorToken,
                }}
              />
              <span>{src.storeName}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
