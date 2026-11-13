import { useState } from 'react';
import { X } from 'lucide-react';
import { Product } from '../types/market';

interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: Partial<Product>) => Promise<void>;
}

export function AddProductModal({ open, onClose, onCreate }: AddProductModalProps) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('Consumer Electronics');
  const [ownNetPrice, setOwnNetPrice] = useState('299');
  const [ownCostBasis, setOwnCostBasis] = useState('240');
  const [negativeKeywords, setNegativeKeywords] = useState('case, cable, refurbished, used');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        sku: sku.trim(),
        category: category.trim(),
        ownNetPrice: Number.parseFloat(ownNetPrice) || 100,
        ownCostBasis: Number.parseFloat(ownCostBasis) || 75,
        keywords: [name.trim(), sku.trim()],
        negativeKeywords: negativeKeywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
      });
      setName('');
      setSku('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Track New Product SKU
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-900 rounded"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Exact Product Model Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Garmin Fenix 8 AMOLED 47mm"
              className="w-full h-9 px-3 rounded-md border border-slate-200 text-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Model / SKU Code
              </label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. 010-02904-11"
                className="w-full h-9 px-3 rounded-md border border-slate-200 font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Your Own Net Price (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={ownNetPrice}
                onChange={(e) => setOwnNetPrice(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Unit Cost Basis (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={ownCostBasis}
                onChange={(e) => setOwnCostBasis(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 font-mono text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Negative Keyword Exclusions (comma-separated)
            </label>
            <input
              type="text"
              value={negativeKeywords}
              onChange={(e) => setNegativeKeywords(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-slate-200 text-slate-900"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 h-9 border border-slate-200 rounded-md font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 h-9 bg-teal-700 text-white rounded-md font-medium hover:bg-teal-800 disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Tracked SKU'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
