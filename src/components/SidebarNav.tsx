import {
  Activity,
  Bell,
  Code2,
  Database,
  Layers,
  PhoneCall,
  Plus,
  X,
} from 'lucide-react';
import { Product } from '../types/market';

export type WorkspaceTab =
  | 'matrix'
  | 'sales_call'
  | 'scraper_lab'
  | 'alerts'
  | 'blueprint';

interface SidebarNavProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  products: Product[];
  selectedProductId: string;
  onSelectProduct: (id: string) => void;
  onAddProductClick: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: WorkspaceTab; label: string; icon: typeof Activity }[] = [
  { id: 'matrix', label: 'Market Matrix', icon: Activity },
  { id: 'sales_call', label: 'Sales Call Mode', icon: PhoneCall },
  { id: 'scraper_lab', label: 'Scraper & Tax Lab', icon: Code2 },
  { id: 'alerts', label: 'Alerts & Digests', icon: Bell },
  { id: 'blueprint', label: 'Railway Blueprint', icon: Database },
];

export function SidebarNav({
  activeTab,
  onSelectTab,
  products,
  selectedProductId,
  onSelectProduct,
  onAddProductClick,
  mobileOpen,
  onCloseMobile,
}: SidebarNavProps) {
  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-700 text-white">
            <Layers className="h-4 w-4" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            PriceLedger
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 py-4">
        <div className="px-2.5 mb-2 text-xs font-medium text-slate-500">
          Workspace
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-700 ${
                  active
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? 'text-teal-700' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="px-3 py-3 border-t border-slate-200 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-2.5 mb-2">
          <span className="text-xs font-medium text-slate-500">
            Tracked SKUs ({products.length})
          </span>
          <button
            type="button"
            onClick={() => {
              onAddProductClick();
              onCloseMobile();
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add SKU</span>
          </button>
        </div>

        <div className="space-y-1">
          {products.map((prod) => {
            const isSelected = prod.id === selectedProductId;
            return (
              <button
                key={prod.id}
                type="button"
                onClick={() => {
                  onSelectProduct(prod.id);
                  onCloseMobile();
                }}
                className={`w-full text-left px-2.5 py-2.5 rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-teal-700 ${
                  isSelected
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="text-xs font-semibold truncate">{prod.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 font-mono tabular-nums truncate">
                  <span>{prod.sku}</span>
                  <span aria-hidden="true">·</span>
                  <span>{prod.category}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-3.5 border-t border-slate-200 text-xs text-slate-500">
        <div className="font-medium text-slate-700">Railway Project Spec</div>
        <div className="mt-0.5 text-[11px]">
          Web + Worker + Postgres JSONB
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
