import { useEffect, useMemo, useState } from 'react';
import { Menu, RefreshCw } from 'lucide-react';
import { AddProductModal } from './components/AddProductModal';
import { AlertsCenter } from './components/AlertsCenter';
import { ComparisonMatrix } from './components/ComparisonMatrix';
import { RailwayBlueprint } from './components/RailwayBlueprint';
import { SalesCallMode } from './components/SalesCallMode';
import { ScraperConfigLab } from './components/ScraperConfigLab';
import { SidebarNav, WorkspaceTab } from './components/SidebarNav';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import {
  AlertRule,
  CurrencyCode,
  MarketStatePayload,
  Product,
  SourceConfig,
  TaxViewMode,
} from './types/market';

const TAB_TITLES: Record<WorkspaceTab, string> = {
  matrix: 'Market Matrix',
  sales_call: 'Sales Call Mode',
  scraper_lab: 'Scraper & Tax Lab',
  alerts: 'Alerts & Digests',
  blueprint: 'Railway Blueprint',
};

export default function App() {
  const [state, setState] = useState<MarketStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('matrix');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [taxMode, setTaxMode] = useState<TaxViewMode>('gross');
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>('IL');
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>('USD');

  const [scanning, setScanning] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);

  const fetchState = async () => {
    try {
      setError(null);
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('Failed to load workspace state');
      const data = (await res.json()) as MarketStatePayload;
      setState(data);
      if (!selectedProductId && data.products.length > 0) {
        setSelectedProductId(data.products[0].id);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  const selectedProduct = useMemo(() => {
    if (!state) return null;
    return (
      state.products.find((p) => p.id === selectedProductId) ||
      state.products[0] ||
      null
    );
  }, [state, selectedProductId]);

  const buyerProfile = useMemo(() => {
    if (!state) {
      return {
        code: 'IL',
        name: 'Israel (18% VAT)',
        vatRate: 0.18,
        importDutyThresholdUsd: 75,
        importDutyRate: 0,
        defaultCurrency: 'ILS' as CurrencyCode,
      };
    }
    return (
      state.taxProfiles.find((t) => t.code === selectedCountryCode) ||
      state.taxProfiles[0]
    );
  }, [state, selectedCountryCode]);

  const handleRunScan = async () => {
    if (!selectedProduct) return;
    setScanning(true);
    try {
      const res = await fetch('/api/scrape/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selectedProduct.id }),
      });
      if (!res.ok) throw new Error('Scan failed');
      const updated = await res.json();
      setState((prev) =>
        prev
          ? {
              ...prev,
              sources: updated.sources,
              history: updated.history,
            }
          : prev
      );
    } finally {
      setScanning(false);
    }
  };

  const handleCreateProduct = async (payload: Partial<Product>) => {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const created = (await res.json()) as Product;
      setState((prev) =>
        prev ? { ...prev, products: [created, ...prev.products] } : prev
      );
      setSelectedProductId(created.id);
    }
  };

  const handleCreateSource = async (payload: Partial<SourceConfig>) => {
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await fetchState();
    }
  };

  const handleDeleteSource = async (id: string) => {
    const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setState((prev) =>
        prev
          ? {
              ...prev,
              sources: prev.sources.filter((s) => s.id !== id),
              history: prev.history.filter((h) => h.sourceConfigId !== id),
            }
          : prev
      );
    }
  };

  const handleCreateAlert = async (payload: Partial<AlertRule>) => {
    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const created = (await res.json()) as AlertRule;
      setState((prev) =>
        prev ? { ...prev, alerts: [created, ...prev.alerts] } : prev
      );
    }
  };

  const handleToggleAlert = async (id: string, isActive: boolean) => {
    const res = await fetch(`/api/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    if (res.ok) {
      const updated = (await res.json()) as AlertRule;
      setState((prev) =>
        prev
          ? {
              ...prev,
              alerts: prev.alerts.map((a) => (a.id === id ? updated : a)),
            }
          : prev
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl space-y-4">
          <div className="h-10 bg-slate-200/70 rounded-md animate-pulse" />
          <div className="h-24 bg-slate-200/60 rounded-lg animate-pulse" />
          <div className="h-72 bg-slate-200/60 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !state || !selectedProduct) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-md text-center">
          <h1 className="text-base font-semibold text-slate-900">
            Unable to load PriceLedger workspace
          </h1>
          <p className="mt-1 text-xs text-slate-500">{error || 'No products found.'}</p>
          <button
            type="button"
            onClick={fetchState}
            className="mt-4 px-4 py-2 bg-teal-700 text-white text-xs font-medium rounded-md hover:bg-teal-800"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        products={state.products}
        selectedProductId={selectedProduct.id}
        onSelectProduct={setSelectedProductId}
        onAddProductClick={() => setAddProductOpen(true)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean SaaS Top Header: Contextual Breadcrumb + 1 Primary Action */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-md text-slate-600 hover:bg-slate-100"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 truncate">
              <span className="font-medium text-slate-900 whitespace-nowrap shrink-0">
                {TAB_TITLES[activeTab]}
              </span>
              <span aria-hidden="true">/</span>
              <span className="font-mono text-xs text-slate-600 truncate">
                {selectedProduct.sku}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunScan}
            disabled={scanning}
            className="px-4 py-2 bg-teal-700 text-white text-xs font-medium rounded-md hover:bg-teal-800 disabled:opacity-60 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Scanning...' : 'Run Market Scan'}</span>
          </button>
        </header>

        {/* Main Workspace Content */}
        <main className="flex-1 px-4 sm:px-6 py-6 max-w-7xl w-full mx-auto space-y-6">
          {/* Product Heading + Global Gross/Net/Tax Toolbar */}
          {activeTab !== 'blueprint' && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight text-balance">
                    {selectedProduct.name}
                  </h1>
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedProduct.brand} · {selectedProduct.category} · Target Net:{' '}
                    <span className="font-mono tabular-nums text-slate-700 font-medium">
                      ${selectedProduct.ownNetPrice.toFixed(2)} USD
                    </span>
                  </p>
                </div>
              </div>

              <WorkspaceToolbar
                taxMode={taxMode}
                onChangeTaxMode={setTaxMode}
                selectedCountryCode={selectedCountryCode}
                onChangeCountry={setSelectedCountryCode}
                taxProfiles={state.taxProfiles}
                displayCurrency={displayCurrency}
                onChangeCurrency={setDisplayCurrency}
              />
            </>
          )}

          {activeTab === 'matrix' && (
            <ComparisonMatrix
              product={selectedProduct}
              sources={state.sources}
              history={state.history}
              buyerProfile={buyerProfile}
              displayCurrency={displayCurrency}
              taxMode={taxMode}
              onNavigateToLab={() => setActiveTab('scraper_lab')}
            />
          )}

          {activeTab === 'sales_call' && (
            <SalesCallMode
              product={selectedProduct}
              sources={state.sources}
              history={state.history}
              buyerProfile={buyerProfile}
              displayCurrency={displayCurrency}
            />
          )}

          {activeTab === 'scraper_lab' && (
            <ScraperConfigLab
              product={selectedProduct}
              sources={state.sources}
              taxProfiles={state.taxProfiles}
              onCreateSource={handleCreateSource}
              onDeleteSource={handleDeleteSource}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertsCenter
              product={selectedProduct}
              sources={state.sources}
              alerts={state.alerts}
              buyerProfile={buyerProfile}
              displayCurrency={displayCurrency}
              onCreateAlert={handleCreateAlert}
              onToggleAlert={handleToggleAlert}
            />
          )}

          {activeTab === 'blueprint' && <RailwayBlueprint />}
        </main>
      </div>

      <AddProductModal
        open={addProductOpen}
        onClose={() => setAddProductOpen(false)}
        onCreate={handleCreateProduct}
      />
    </div>
  );
}
