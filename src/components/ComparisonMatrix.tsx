import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpDown, ArrowUpRight, ExternalLink } from 'lucide-react';
import { convertCurrency, formatMoney, normalizeAllQuotesForProduct } from '../lib/taxEngine';
import {
  CountryTaxProfile,
  CurrencyCode,
  PriceHistoryPoint,
  Product,
  SourceConfig,
  TaxViewMode,
} from '../types/market';
import { PriceHistoryChart } from './PriceHistoryChart';

interface ComparisonMatrixProps {
  product: Product;
  sources: SourceConfig[];
  history: PriceHistoryPoint[];
  buyerProfile: CountryTaxProfile;
  displayCurrency: CurrencyCode;
  taxMode: TaxViewMode;
  onNavigateToLab: () => void;
}

type SortField = 'gross' | 'net' | 'delta';

export function ComparisonMatrix({
  product,
  sources,
  history,
  buyerProfile,
  displayCurrency,
  taxMode,
  onNavigateToLab,
}: ComparisonMatrixProps) {
  const [sortField, setSortField] = useState<SortField>(
    taxMode === 'net' ? 'net' : 'gross'
  );
  const [sortAsc, setSortAsc] = useState(true);
  const [onlyInStock, setOnlyInStock] = useState(false);

  const productSources = useMemo(
    () => sources.filter((s) => s.productId === product.id),
    [sources, product.id]
  );

  const normalizedQuotes = useMemo(() => {
    const all = normalizeAllQuotesForProduct(
      productSources,
      product,
      buyerProfile,
      displayCurrency,
      taxMode
    );
    const filtered = onlyInStock
      ? all.filter((q) => q.source.currentStock !== 'out_of_stock')
      : all;

    return [...filtered].sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sortField === 'net') return (a.netPrice - b.netPrice) * dir;
      if (sortField === 'delta') return (a.deltaVsOwnNetPct - b.deltaVsOwnNetPct) * dir;
      return (a.grossPrice - b.grossPrice) * dir;
    });
  }, [productSources, product, buyerProfile, displayCurrency, taxMode, onlyInStock, sortField, sortAsc]);

  const kpis = useMemo(() => {
    if (normalizedQuotes.length === 0) {
      return null;
    }
    const lowestNet = [...normalizedQuotes].sort((a, b) => a.netPrice - b.netPrice)[0];
    const lowestGross = [...normalizedQuotes].sort((a, b) => a.grossPrice - b.grossPrice)[0];
    const avgNet =
      normalizedQuotes.reduce((sum, q) => sum + q.netPrice, 0) / normalizedQuotes.length;
    const avgGross =
      normalizedQuotes.reduce((sum, q) => sum + q.grossPrice, 0) / normalizedQuotes.length;
    const ownNetDisplay = convertCurrency(product.ownNetPrice, 'USD', displayCurrency);
    const ownGrossDisplay = ownNetDisplay * (1 + buyerProfile.vatRate);

    return {
      lowestNet,
      lowestGross,
      avgNet,
      avgGross,
      ownNetDisplay,
      ownGrossDisplay,
    };
  }, [normalizedQuotes, product.ownNetPrice, displayCurrency, buyerProfile.vatRate]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  if (productSources.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
        <h3 className="text-base font-semibold text-slate-900">
          No source monitors configured for {product.name}
        </h3>
        <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
          Add store URLs with custom CSS or JSON-LD extraction rules and per-source VAT settings to begin tracking normalized Net & Gross prices.
        </p>
        <button
          type="button"
          onClick={onNavigateToLab}
          className="mt-4 px-4 py-2 bg-teal-700 text-white text-xs font-medium rounded-md hover:bg-teal-800 transition-colors"
        >
          Configure First Source
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 4-Column KPI Summary Strip */}
      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-medium text-slate-500">
              Lowest Net (Ex-Tax)
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {formatMoney(kpis.lowestNet.netPrice, displayCurrency)}
            </div>
            <div className="mt-1 text-xs text-slate-500 truncate">
              {kpis.lowestNet.source.storeName} · {kpis.lowestNet.source.countryCode}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-medium text-slate-500">
              Lowest Out-The-Door Gross
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-teal-700">
              {formatMoney(kpis.lowestGross.grossPrice, displayCurrency)}
            </div>
            <div className="mt-1 text-xs text-slate-500 truncate">
              {kpis.lowestGross.source.storeName} · Incl. {Math.round(buyerProfile.vatRate * 100)}% tax & ship
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-medium text-slate-500">
              Market Average ({taxMode === 'net' ? 'Net' : 'Gross'})
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {formatMoney(
                taxMode === 'net' ? kpis.avgNet : kpis.avgGross,
                displayCurrency
              )}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Across {normalizedQuotes.length} active sources
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-medium text-slate-500">
              Your Benchmark ({taxMode === 'net' ? 'Net' : 'Gross'})
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {formatMoney(
                taxMode === 'net' ? kpis.ownNetDisplay : kpis.ownGrossDisplay,
                displayCurrency
              )}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {kpis.lowestNet.netPrice < kpis.ownNetDisplay ? (
                <span className="text-red-600 font-medium">
                  Undercut by {formatMoney(kpis.ownNetDisplay - kpis.lowestNet.netPrice, displayCurrency)} net
                </span>
              ) : (
                <span className="text-emerald-700 font-medium">
                  Lowest net in tracked market
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Comparison Matrix Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Live Store Comparison Matrix
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              SKU {product.sku} · Excludes: {product.negativeKeywords.join(', ') || 'None'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={(e) => setOnlyInStock(e.target.checked)}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
              />
              <span>In-Stock Only</span>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-4">Store & Region</th>
                <th className="py-2.5 px-3 text-right">Scraped Raw</th>
                {(taxMode === 'net' || taxMode === 'both') && (
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('net')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      <span>Net (Ex-Tax)</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                )}
                {taxMode !== 'net' && (
                  <>
                    <th className="py-2.5 px-3 text-right">Buyer Tax / Duty</th>
                    <th className="py-2.5 px-3 text-right">Shipping</th>
                    <th className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleSort('gross')}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        <span>Final Gross</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                  </>
                )}
                <th className="py-2.5 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('delta')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Vs. Your Price</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3">Stock</th>
                <th className="py-2.5 px-4 text-right">Last Scan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {normalizedQuotes.map((q) => {
                const isLowest =
                  kpis &&
                  (taxMode === 'net'
                    ? q.source.id === kpis.lowestNet.source.id
                    : q.source.id === kpis.lowestGross.source.id);

                const deltaNegative = q.deltaVsOwnNetPct < 0;
                const lastTime = new Date(q.source.lastScrapedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <tr
                    key={q.source.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isLowest ? 'bg-teal-50/35' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-xs shrink-0"
                          style={{ backgroundColor: q.source.colorToken }}
                        />
                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <span>{q.source.storeName}</span>
                            {isLowest && (
                              <span className="text-[11px] font-medium text-teal-700">
                                · Best Price
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            <span>{q.source.countryCode}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {q.source.taxRules.sourceIncludesTax
                                ? `Incl. ${Math.round(q.source.taxRules.sourceVatRate * 100)}% src VAT`
                                : 'Excl. src tax'}
                            </span>
                            <a
                              href={q.source.productUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-400 hover:text-teal-700 inline-flex items-center"
                              title="Open source product URL"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                      {formatMoney(q.rawPriceOriginal, q.source.currency)}
                    </td>

                    {(taxMode === 'net' || taxMode === 'both') && (
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatMoney(q.netPrice, displayCurrency)}
                      </td>
                    )}

                    {taxMode !== 'net' && (
                      <>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                          {formatMoney(
                            q.buyerVatAmount + q.importDutyAmount,
                            displayCurrency
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                          {q.shippingInDisplayCurrency > 0
                            ? formatMoney(q.shippingInDisplayCurrency, displayCurrency)
                            : 'Free'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {formatMoney(q.grossPrice, displayCurrency)}
                        </td>
                      </>
                    )}

                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <span
                        className={`inline-flex items-center justify-end gap-0.5 font-medium ${
                          deltaNegative ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {deltaNegative ? (
                          <ArrowDownRight className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        )}
                        {q.deltaVsOwnNetPct > 0 ? '+' : ''}
                        {q.deltaVsOwnNetPct.toFixed(1)}%
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      {q.source.currentStock === 'in_stock' && (
                        <span className="text-emerald-700 font-medium">In Stock</span>
                      )}
                      {q.source.currentStock === 'low_stock' && (
                        <span className="text-amber-700 font-medium">Low Stock</span>
                      )}
                      {q.source.currentStock === 'out_of_stock' && (
                        <span className="text-red-600 font-medium">Out of Stock</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                      {lastTime}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Interactive Price History Chart */}
      <PriceHistoryChart
        product={product}
        sources={sources}
        history={history}
        buyerProfile={buyerProfile}
        displayCurrency={displayCurrency}
        taxMode={taxMode}
      />
    </div>
  );
}
