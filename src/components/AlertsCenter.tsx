import { useMemo, useState } from 'react';
import { BellPlus, Check } from 'lucide-react';
import { formatMoney, normalizeAllQuotesForProduct } from '../lib/taxEngine';
import {
  AlertChannel,
  AlertCondition,
  AlertRule,
  CountryTaxProfile,
  CurrencyCode,
  Product,
  SourceConfig,
} from '../types/market';

interface AlertsCenterProps {
  product: Product;
  sources: SourceConfig[];
  alerts: AlertRule[];
  buyerProfile: CountryTaxProfile;
  displayCurrency: CurrencyCode;
  onCreateAlert: (payload: Partial<AlertRule>) => Promise<void>;
  onToggleAlert: (id: string, isActive: boolean) => Promise<void>;
}

const ALL_CHANNELS: { id: AlertChannel; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'push', label: 'Web Push' },
];

export function AlertsCenter({
  product,
  sources,
  alerts,
  buyerProfile,
  displayCurrency,
  onCreateAlert,
  onToggleAlert,
}: AlertsCenterProps) {
  const [name, setName] = useState('');
  const [condition, setCondition] = useState<AlertCondition>('undercut_own_price');
  const [thresholdValue, setThresholdValue] = useState('5');
  const [taxBasis, setTaxBasis] = useState<'gross' | 'net'>('gross');
  const [channels, setChannels] = useState<AlertChannel[]>(['whatsapp', 'email']);
  const [webhookTarget, setWebhookTarget] = useState('https://api.telegram.org/bot_token/sendMessage');
  const [saving, setSaving] = useState(false);

  const productAlerts = useMemo(
    () => alerts.filter((a) => a.productId === product.id),
    [alerts, product.id]
  );

  const quotes = useMemo(
    () =>
      normalizeAllQuotesForProduct(
        sources.filter((s) => s.productId === product.id),
        product,
        buyerProfile,
        displayCurrency,
        'both'
      ),
    [sources, product, buyerProfile, displayCurrency]
  );

  const lowestNet = [...quotes].sort((a, b) => a.netPrice - b.netPrice)[0];
  const lowestGross = [...quotes].sort((a, b) => a.grossPrice - b.grossPrice)[0];

  const toggleChannel = (ch: AlertChannel) => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreateAlert({
        productId: product.id,
        name,
        condition,
        thresholdValue: Number.parseFloat(thresholdValue) || 5,
        taxBasis,
        channels: channels.length ? channels : ['email'],
        webhookTarget,
        digestEnabled: true,
      });
      setName('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* Left: Create Alert & Existing Rules */}
      <div className="xl:col-span-7 space-y-6">
        <section className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-base font-semibold text-slate-900">
            Configure Price & Stock Alert
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Evaluated by the Railway worker immediately after each scheduled scrape commit.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Alert Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Notify sales desk if KSP undercuts by 4%"
                className="w-full h-9 px-3 rounded-md border border-slate-200 text-xs text-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Trigger Condition
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as AlertCondition)}
                  className="w-full h-9 px-2.5 rounded-md border border-slate-200 text-xs bg-white"
                >
                  <option value="undercut_own_price">Undercuts Own Price (%)</option>
                  <option value="price_drop_pct">24h Price Drop (%)</option>
                  <option value="target_below">Drops Below Target</option>
                  <option value="stock_change">Stock Status Change</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Threshold Value
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={thresholdValue}
                  onChange={(e) => setThresholdValue(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-200 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Evaluation Tax Basis
                </label>
                <select
                  value={taxBasis}
                  onChange={(e) => setTaxBasis(e.target.value as 'gross' | 'net')}
                  className="w-full h-9 px-2.5 rounded-md border border-slate-200 text-xs bg-white"
                >
                  <option value="gross">Gross (Incl. Tax)</option>
                  <option value="net">Net (Ex-Tax)</option>
                </select>
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1.5">
                Delivery Channels
              </span>
              <div className="flex flex-wrap gap-2">
                {ALL_CHANNELS.map((ch) => {
                  const selected = channels.includes(ch.id);
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => toggleChannel(ch.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border inline-flex items-center gap-1.5 transition-colors ${
                        selected
                          ? 'bg-teal-50 border-teal-700 text-teal-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {selected && <Check className="h-3 w-3" />}
                      <span>{ch.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Webhook / Recipient Target
              </label>
              <input
                type="text"
                value={webhookTarget}
                onChange={(e) => setWebhookTarget(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 font-mono text-xs text-slate-700"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-4 h-9 bg-teal-700 text-white text-xs font-medium rounded-md hover:bg-teal-800 inline-flex items-center gap-1.5"
            >
              <BellPlus className="h-3.5 w-3.5" />
              <span>{saving ? 'Saving...' : 'Create Alert Rule'}</span>
            </button>
          </form>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">
              Active Rules for {product.sku} ({productAlerts.length})
            </h3>
          </div>
          {productAlerts.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              No alert rules configured for this SKU yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {productAlerts.map((rule) => (
                <div
                  key={rule.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-4 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{rule.name}</div>
                    <div className="mt-0.5 text-slate-500">
                      Basis: {rule.taxBasis.toUpperCase()} · Channels: {rule.channels.join(', ')} · Threshold:{' '}
                      <span className="font-mono tabular-nums">{rule.thresholdValue}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleAlert(rule.id, !rule.isActive)}
                    className={`px-3 py-1 rounded text-xs font-medium border whitespace-nowrap shrink-0 ${
                      rule.isActive
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    {rule.isActive ? 'Enabled' : 'Paused'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Right: 24-Hour Automated Digest Preview */}
      <section className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            24-Hour Summary Digest Preview
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Compiled daily at 08:00 UTC by the Railway cron dispatcher.
          </p>
        </div>

        <div className="p-4 rounded-md bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {`[PriceLedger 24h Digest]
SKU: ${product.sku} — ${product.name}
Jurisdiction: ${buyerProfile.name} (${displayCurrency})

• Lowest Net (B2B Ex-Tax): ${
            lowestNet
              ? `${formatMoney(lowestNet.netPrice, displayCurrency)} @ ${lowestNet.source.storeName}`
              : 'N/A'
          }
• Lowest Gross (Out-the-Door): ${
            lowestGross
              ? `${formatMoney(lowestGross.grossPrice, displayCurrency)} @ ${lowestGross.source.storeName}`
              : 'N/A'
          }
• Sources Monitored: ${quotes.length} active
• Out-of-Stock Count: ${
            quotes.filter((q) => q.source.currentStock === 'out_of_stock').length
          }`}
        </div>
      </section>
    </div>
  );
}
