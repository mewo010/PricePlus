import { useState } from 'react';
import { Play, Plus, Trash2 } from 'lucide-react';
import { formatMoney } from '../lib/taxEngine';
import {
  CountryTaxProfile,
  CurrencyCode,
  Product,
  ScrapeTestResult,
  SourceConfig,
} from '../types/market';

interface ScraperConfigLabProps {
  product: Product;
  sources: SourceConfig[];
  taxProfiles: CountryTaxProfile[];
  onCreateSource: (payload: Partial<SourceConfig>) => Promise<void>;
  onDeleteSource: (id: string) => Promise<void>;
}

const SAMPLE_HTML_TEMPLATES: { label: string; engine: 'jsonld' | 'css'; selector: string; html: string }[] = [
  {
    label: 'JSON-LD Storefront (Israel 18% VAT)',
    engine: 'jsonld',
    selector: 'script[type="application/ld+json"] -> offers.price',
    html: `<!doctype html>
<html>
<head>
  <title>Sony WH-1000XM5 Wireless Headphones — KSP</title>
  <script type="application/ld+json">
    {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": "Sony WH-1000XM5 Wireless Noise Canceling Headphones Black",
      "sku": "WH1000XM5/B",
      "offers": {
        "@type": "Offer",
        "priceCurrency": "ILS",
        "price": "1249.00",
        "availability": "https://schema.org/InStock"
      }
    }
  </script>
</head>
<body>
  <h1 class="product-title">Sony WH-1000XM5 Wireless Noise Canceling Headphones Black</h1>
</body>
</html>`,
  },
  {
    label: 'CSS Selector + Negative Keyword Trap (Accessory Case)',
    engine: 'css',
    selector: '.price-box .final-price',
    html: `<!doctype html>
<html>
<body>
  <h1 class="product-title">Hard Travel Carrying Case for Sony WH-1000XM5</h1>
  <div class="price-box">
    <span class="final-price">$24.99</span>
  </div>
</body>
</html>`,
  },
];

export function ScraperConfigLab({
  product,
  sources,
  taxProfiles,
  onCreateSource,
  onDeleteSource,
}: ScraperConfigLabProps) {
  const productSources = sources.filter((s) => s.productId === product.id);

  // Live Scraper Sandbox state
  const [testMode, setTestMode] = useState<'html' | 'url'>('html');
  const [testUrl, setTestUrl] = useState('https://example.com');
  const [htmlSnippet, setHtmlSnippet] = useState(SAMPLE_HTML_TEMPLATES[0].html);
  const [engine, setEngine] = useState<'css' | 'jsonld' | 'regex'>('jsonld');
  const [priceSelector, setPriceSelector] = useState(SAMPLE_HTML_TEMPLATES[0].selector);
  const [negKeywordsInput, setNegKeywordsInput] = useState(
    product.negativeKeywords.join(', ')
  );
  const [srcIncludesTax, setSrcIncludesTax] = useState(true);
  const [srcVatRate, setSrcVatRate] = useState('18');
  const [targetVatRate, setTargetVatRate] = useState('18');
  const [shippingCost, setShippingCost] = useState('0');
  const [currency, setCurrency] = useState<CurrencyCode>('ILS');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ScrapeTestResult | null>(null);

  // Add Source Form state
  const [storeName, setStoreName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceCountry, setSourceCountry] = useState('IL');
  const [rawPriceInput, setRawPriceInput] = useState('1199');
  const [savingSource, setSavingSource] = useState(false);

  const handleRunSandbox = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/scrape/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: testMode === 'url' ? testUrl : undefined,
          htmlSnippet: testMode === 'html' ? htmlSnippet : undefined,
          engine,
          priceSelector,
          negativeKeywords: negKeywordsInput
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
          sourceIncludesTax: srcIncludesTax,
          sourceVatRate: (Number.parseFloat(srcVatRate) || 0) / 100,
          targetVatRate: (Number.parseFloat(targetVatRate) || 0) / 100,
          shippingCost: Number.parseFloat(shippingCost) || 0,
          currency,
        }),
      });
      const data = (await res.json()) as ScrapeTestResult;
      setTestResult(data);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !sourceUrl.trim()) return;
    setSavingSource(true);
    try {
      await onCreateSource({
        productId: product.id,
        storeName,
        productUrl: sourceUrl,
        countryCode: sourceCountry,
        currency,
        currentRawPrice: Number.parseFloat(rawPriceInput) || 299,
        scraperRules: {
          engine,
          priceSelector,
          usePlaywrightFallback: false,
          userAgentProfile: 'desktop_chrome',
          requestTimeoutMs: 8000,
        },
        taxRules: {
          sourceIncludesTax: srcIncludesTax,
          sourceVatRate: (Number.parseFloat(srcVatRate) || 0) / 100,
          shippingCost: Number.parseFloat(shippingCost) || 0,
          shippingCurrency: currency,
          importHandlingFee: 0,
        },
      });
      setStoreName('');
      setSourceUrl('');
    } finally {
      setSavingSource(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Live Cheerio Scraper & Tax Rule Sandbox */}
        <section className="xl:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Live Scraper & Tax Rule Sandbox
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Tests HTML/JSON-LD extraction, negative keyword filtering, and Net/Gross calculation on the server.
              </p>
            </div>
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => setTestMode('html')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  testMode === 'html' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                HTML Fixture
              </button>
              <button
                type="button"
                onClick={() => setTestMode('url')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  testMode === 'url' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Live URL Fetch
              </button>
            </div>
          </div>

          {testMode === 'html' ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-700">
                  Source HTML Payload
                </label>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_HTML_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => {
                        setHtmlSnippet(tpl.html);
                        setEngine(tpl.engine);
                        setPriceSelector(tpl.selector);
                      }}
                      className="text-[11px] font-medium text-teal-700 hover:underline"
                    >
                      Load: {tpl.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                rows={7}
                value={htmlSnippet}
                onChange={(e) => setHtmlSnippet(e.target.value)}
                className="w-full p-3 rounded-md border border-slate-200 font-mono text-xs text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Target Product URL (HTTP/HTTPS)
              </label>
              <input
                type="url"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://store.example.com/product/123"
                className="w-full h-9 px-3 rounded-md border border-slate-200 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
          )}

          {/* Extraction & Tax Config Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Parser Engine
              </label>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value as 'css' | 'jsonld' | 'regex')}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 text-xs bg-white text-slate-900"
              >
                <option value="jsonld">JSON-LD (Schema.org)</option>
                <option value="css">CSS Selector (Cheerio)</option>
                <option value="regex">RegExp Pattern</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Price Selector / Pattern
              </label>
              <input
                type="text"
                value={priceSelector}
                onChange={(e) => setPriceSelector(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 font-mono text-xs text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Source Tax Mode
              </label>
              <select
                value={srcIncludesTax ? 'incl' : 'excl'}
                onChange={(e) => setSrcIncludesTax(e.target.value === 'incl')}
                className="w-full h-9 px-2 rounded-md border border-slate-200 text-xs bg-white"
              >
                <option value="incl">Includes VAT</option>
                <option value="excl">Excludes Tax</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Src VAT (%)
              </label>
              <input
                type="number"
                value={srcVatRate}
                onChange={(e) => setSrcVatRate(e.target.value)}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Buyer VAT (%)
              </label>
              <input
                type="number"
                value={targetVatRate}
                onChange={(e) => setTargetVatRate(e.target.value)}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full h-9 px-2 rounded-md border border-slate-200 font-mono text-xs bg-white"
              >
                <option value="ILS">ILS</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Negative Keyword Exclusions (comma-separated)
              </label>
              <input
                type="text"
                value={negKeywordsInput}
                onChange={(e) => setNegKeywordsInput(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 text-xs text-slate-900"
              />
            </div>
            <button
              type="button"
              onClick={handleRunSandbox}
              disabled={testing}
              className="h-9 px-4 bg-teal-700 text-white text-xs font-medium rounded-md hover:bg-teal-800 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{testing ? 'Parsing...' : 'Run Extractor Test'}</span>
            </button>
          </div>

          {testResult && (
            <div className="mt-4 p-4 rounded-md border border-slate-200 bg-slate-50 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`font-semibold ${
                    testResult.success ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {testResult.success
                    ? 'Extraction Validated'
                    : testResult.negativeMatchFound
                    ? `Rejected by Negative Keyword: "${testResult.negativeMatchFound}"`
                    : 'Extraction Failed'}
                </span>
                <span className="font-mono tabular-nums text-slate-500">
                  {testResult.durationMs}ms · HTTP {testResult.httpStatus ?? 'N/A'}
                </span>
              </div>

              <div className="text-slate-700">
                <span className="text-slate-500">Extracted Title: </span>
                <span className="font-medium">{testResult.extractedTitle}</span>
              </div>

              {testResult.rawPrice !== null && (
                <div className="grid grid-cols-3 gap-2 pt-1 font-mono tabular-nums">
                  <div className="p-2 bg-white border border-slate-200 rounded">
                    <div className="text-[10px] text-slate-500">Raw Price</div>
                    <div className="font-semibold text-slate-900">
                      {formatMoney(testResult.rawPrice, testResult.currency)}
                    </div>
                  </div>
                  <div className="p-2 bg-white border border-slate-200 rounded">
                    <div className="text-[10px] text-slate-500">Net Ex-Tax</div>
                    <div className="font-semibold text-slate-900">
                      {testResult.netPrice !== null
                        ? formatMoney(testResult.netPrice, testResult.currency)
                        : '—'}
                    </div>
                  </div>
                  <div className="p-2 bg-white border border-slate-200 rounded">
                    <div className="text-[10px] text-slate-500">Final Gross</div>
                    <div className="font-semibold text-teal-700">
                      {testResult.grossPrice !== null
                        ? formatMoney(testResult.grossPrice, testResult.currency)
                        : '—'}
                    </div>
                  </div>
                </div>
              )}

              <ul className="space-y-0.5 text-[11px] font-mono text-slate-500 pt-1">
                {testResult.diagnostics.map((d, i) => (
                  <li key={i}>• {d}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Save New SourceConfig + View JSONB Rules */}
        <section className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Attach Store Monitor to {product.sku}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Persists scraper_rules and tax_rules JSONB configuration for scheduled worker scans.
            </p>
          </div>

          <form onSubmit={handleSaveSource} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Store Name
              </label>
              <input
                type="text"
                required
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="e.g. Bug Israel"
                className="w-full h-9 px-3 rounded-md border border-slate-200 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Product Page URL
              </label>
              <input
                type="url"
                required
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://www.bug.co.il/brand/sony/wh1000xm5"
                className="w-full h-9 px-3 rounded-md border border-slate-200 font-mono text-xs text-slate-900"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Origin Country
                </label>
                <select
                  value={sourceCountry}
                  onChange={(e) => setSourceCountry(e.target.value)}
                  className="w-full h-9 px-2 rounded-md border border-slate-200 text-xs bg-white"
                >
                  {taxProfiles
                    .filter((t) => t.code !== 'B2B_EXEMPT')
                    .map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.code}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Shipping Fee
                </label>
                <input
                  type="number"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-md border border-slate-200 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Initial Price
                </label>
                <input
                  type="number"
                  value={rawPriceInput}
                  onChange={(e) => setRawPriceInput(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-md border border-slate-200 font-mono text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingSource}
              className="w-full h-9 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{savingSource ? 'Saving...' : 'Save SourceConfig (JSONB)'}</span>
            </button>
          </form>

          {/* Active JSONB Source List */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-xs font-semibold text-slate-700 mb-2.5">
              Configured JSONB Sources ({productSources.length})
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {productSources.map((src) => (
                <div
                  key={src.id}
                  className="p-3 rounded-md border border-slate-200 bg-slate-50/70 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {src.storeName} · {src.countryCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteSource(src.id)}
                      className="text-slate-400 hover:text-red-600 p-1"
                      title="Remove source"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-600 truncate">
                    {src.scraperRules.engine.toUpperCase()}: {src.scraperRules.priceSelector}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {src.taxRules.sourceIncludesTax
                      ? `Incl. ${Math.round(src.taxRules.sourceVatRate * 100)}% VAT`
                      : 'Excl. tax'}{' '}
                    · Ship {formatMoney(src.taxRules.shippingCost, src.taxRules.shippingCurrency)} · Every {src.scanIntervalHours}h
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
