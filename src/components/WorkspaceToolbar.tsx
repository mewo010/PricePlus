import { CountryTaxProfile, CurrencyCode, TaxViewMode } from '../types/market';

interface WorkspaceToolbarProps {
  taxMode: TaxViewMode;
  onChangeTaxMode: (mode: TaxViewMode) => void;
  selectedCountryCode: string;
  onChangeCountry: (code: string) => void;
  taxProfiles: CountryTaxProfile[];
  displayCurrency: CurrencyCode;
  onChangeCurrency: (curr: CurrencyCode) => void;
}

const CURRENCIES: CurrencyCode[] = ['USD', 'ILS', 'EUR', 'GBP'];

export function WorkspaceToolbar({
  taxMode,
  onChangeTaxMode,
  selectedCountryCode,
  onChangeCountry,
  taxProfiles,
  displayCurrency,
  onChangeCurrency,
}: WorkspaceToolbarProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
          Price Normalization
        </span>
        <div
          className="inline-flex items-center p-1 bg-slate-100 rounded-md"
          role="group"
          aria-label="Tax display mode"
        >
          {(
            [
              { id: 'gross', label: 'Gross (Incl. Tax)' },
              { id: 'net', label: 'Net (Ex-Tax)' },
              { id: 'both', label: 'Side-by-Side' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChangeTaxMode(opt.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-700 ${
                taxMode === opt.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <span className="font-medium text-slate-500 whitespace-nowrap shrink-0">
            Buyer Tax Jurisdiction
          </span>
          <select
            value={selectedCountryCode}
            onChange={(e) => onChangeCountry(e.target.value)}
            className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
          >
            {taxProfiles.map((profile) => (
              <option key={profile.code} value={profile.code}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-600">
          <span className="font-medium text-slate-500 whitespace-nowrap shrink-0">
            Currency
          </span>
          <select
            value={displayCurrency}
            onChange={(e) => onChangeCurrency(e.target.value as CurrencyCode)}
            className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
