import { useMemo, useState } from 'react';
import {
  convertCurrency,
  formatMoney,
  normalizeAllQuotesForProduct,
} from '../lib/taxEngine';
import {
  CountryTaxProfile,
  CurrencyCode,
  PriceHistoryPoint,
  Product,
  SourceConfig,
} from '../types/market';

interface SalesCallModeProps {
  product: Product;
  sources: SourceConfig[];
  history: PriceHistoryPoint[];
  buyerProfile: CountryTaxProfile;
  displayCurrency: CurrencyCode;
}

export function SalesCallMode({
  product,
  sources,
  history,
  buyerProfile,
  displayCurrency,
}: SalesCallModeProps) {
  const ownNetDisplay = convertCurrency(product.ownNetPrice, 'USD', displayCurrency);
  const costBasisDisplay = convertCurrency(product.ownCostBasis, 'USD', displayCurrency);
  const [proposedNetPrice, setProposedNetPrice] = useState<string>(
    ownNetDisplay.toFixed(2)
  );

  const productSources = useMemo(
    () => sources.filter((s) => s.productId === product.id),
    [sources, product.id]
  );

  const quotes = useMemo(
    () =>
      normalizeAllQuotesForProduct(
        productSources,
        product,
        buyerProfile,
        displayCurrency,
        'both'
      ),
    [productSources, product, buyerProfile, displayCurrency]
  );

  const inStockQuotes = useMemo(
    () => quotes.filter((q) => q.source.currentStock !== 'out_of_stock'),
    [quotes]
  );

  const lowestNetQuote = useMemo(() => {
    const pool = inStockQuotes.length ? inStockQuotes : quotes;
    return [...pool].sort((a, b) => a.netPrice - b.netPrice)[0] || null;
  }, [inStockQuotes, quotes]);

  const lowestGrossQuote = useMemo(() => {
    const pool = inStockQuotes.length ? inStockQuotes : quotes;
    return [...pool].sort((a, b) => a.grossPrice - b.grossPrice)[0] || null;
  }, [inStockQuotes, quotes]);

  // Calculate 30-day volatility & price floor
  const stabilityStats = useMemo(() => {
    const prodHist = history.filter((h) => h.productId === product.id);
    if (prodHist.length === 0) {
      return { low30d: 0, high30d: 0, spreadPct: 0, stabilityLabel: 'No Data' };
    }
    const nets = prodHist.map((h) =>
      convertCurrency(h.netPriceUsd, 'USD', displayCurrency)
    );
    const low30d = Math.min(...nets);
    const high30d = Math.max(...nets);
    const spreadPct = low30d > 0 ? ((high30d - low30d) / low30d) * 100 : 0;
    const stabilityLabel =
      spreadPct < 8 ? 'High Stability' : spreadPct < 15 ? 'Moderate Variance' : 'Volatile';
    return { low30d, high30d, spreadPct, stabilityLabel };
  }, [history, product.id, displayCurrency]);

  const proposedNetNum = Number.parseFloat(proposedNetPrice) || 0;
  const proposedGrossNum = proposedNetNum * (1 + buyerProfile.vatRate);
  const grossMarginAbs = proposedNetNum - costBasisDisplay;
  const grossMarginPct =
    proposedNetNum > 0 ? (grossMarginAbs / proposedNetNum) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Rapid Sales Call Hero Card */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="text-xs font-medium text-teal-700">
              Live Sales Call Quick Reference
            </div>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {product.name}
            </h2>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              SKU {product.sku} · Cost Basis {formatMoney(costBasisDisplay, displayCurrency)} · Jurisdiction {buyerProfile.name}
            </p>
          </div>
          {lowestNetQuote && (
            <button
              type="button"
              onClick={() => setProposedNetPrice(lowestNetQuote.netPrice.toFixed(2))}
              className="px-4 py-2 bg-teal-700 text-white text-xs font-medium rounded-md hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
            >
              Match Lowest Net ({formatMoney(lowestNetQuote.netPrice, displayCurrency)})
            </button>
          )}
        </div>

        {/* 3 Big Readout Columns */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs font-medium text-slate-500">
              Lowest Competitor Net (B2B Ex-Tax)
            </div>
            <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-slate-900">
              {lowestNetQuote
                ? formatMoney(lowestNetQuote.netPrice, displayCurrency)
                : '—'}
            </div>
            <div className="mt-1.5 text-xs text-slate-600">
              {lowestNetQuote
                ? `${lowestNetQuote.source.storeName} (${lowestNetQuote.source.countryCode})`
                : 'No active sources'}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs font-medium text-slate-500">
              Lowest Competitor Gross (Out-The-Door)
            </div>
            <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-teal-700">
              {lowestGrossQuote
                ? formatMoney(lowestGrossQuote.grossPrice, displayCurrency)
                : '—'}
            </div>
            <div className="mt-1.5 text-xs text-slate-600">
              {lowestGrossQuote
                ? `${lowestGrossQuote.source.storeName} · Incl. VAT & ship`
                : 'No active sources'}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs font-medium text-slate-500">
              30-Day Market Price Stability
            </div>
            <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-slate-900">
              {stabilityStats.spreadPct.toFixed(1)}%
            </div>
            <div className="mt-1.5 text-xs text-slate-600">
              {stabilityStats.stabilityLabel} · Range{' '}
              <span className="font-mono tabular-nums">
                {formatMoney(stabilityStats.low30d, displayCurrency)}–
                {formatMoney(stabilityStats.high30d, displayCurrency)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Live Negotiation Counter-Quote Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-base font-semibold text-slate-900">
            Live Counter-Quote Margin Guardrail
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Adjust your Net quote during the call to verify unit margin and customer-facing Gross total.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Proposed Net Quote ({displayCurrency} Ex-Tax)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  value={proposedNetPrice}
                  onChange={(e) => setProposedNetPrice(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 font-mono text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
                <button
                  type="button"
                  onClick={() => setProposedNetPrice(ownNetDisplay.toFixed(2))}
                  className="px-3 h-10 border border-slate-200 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <div className="text-[11px] text-slate-500">Customer Gross</div>
                <div className="mt-1 text-base font-bold font-mono tabular-nums text-slate-900">
                  {formatMoney(proposedGrossNum, displayCurrency)}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <div className="text-[11px] text-slate-500">Net Profit / Unit</div>
                <div
                  className={`mt-1 text-base font-bold font-mono tabular-nums ${
                    grossMarginAbs >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {formatMoney(grossMarginAbs, displayCurrency)}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <div className="text-[11px] text-slate-500">Net Margin %</div>
                <div
                  className={`mt-1 text-base font-bold font-mono tabular-nums ${
                    grossMarginPct >= 15
                      ? 'text-emerald-700'
                      : grossMarginPct >= 5
                      ? 'text-amber-700'
                      : 'text-red-600'
                  }`}
                >
                  {grossMarginPct.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-600 pt-1">
              {grossMarginPct < 5
                ? 'Warning: Proposed quote breaches the 5% minimum margin floor.'
                : grossMarginPct < 12
                ? 'Caution: Thin margin tier — verify bulk volume commitment.'
                : 'Healthy margin tier — safe to approve on call.'}
            </div>
          </div>
        </section>

        {/* Compact Mobile-Friendly Competitor Stack */}
        <section className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-base font-semibold text-slate-900">
            Active Competitor Ladder
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Sorted lowest-to-highest by Net Ex-Tax price for instant B2B comparison.
          </p>

          <div className="mt-4 divide-y divide-slate-100">
            {[...quotes]
              .sort((a, b) => a.netPrice - b.netPrice)
              .map((q) => (
                <div
                  key={q.source.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">
                      {q.source.storeName}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {q.source.countryCode} ·{' '}
                      {q.source.currentStock === 'out_of_stock'
                        ? 'Out of Stock'
                        : q.source.currentStock === 'low_stock'
                        ? 'Low Stock'
                        : 'In Stock'}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="font-semibold text-slate-900">
                      {formatMoney(q.netPrice, displayCurrency)} Net
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {formatMoney(q.grossPrice, displayCurrency)} Gross
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
