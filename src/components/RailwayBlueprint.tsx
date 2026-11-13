import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  MVP_ROADMAP,
  POSTGRES_SCHEMA_SQL,
  RAILWAY_TOML,
  SQLALCHEMY_ORM_PY,
  STACK_RECOMMENDATION,
} from '../data/architectureSpec';

export function RailwayBlueprint() {
  const [schemaTab, setSchemaTab] = useState<'sql' | 'orm' | 'railway'>('sql');
  const [copied, setCopied] = useState(false);

  const activeCode =
    schemaTab === 'sql'
      ? POSTGRES_SCHEMA_SQL
      : schemaTab === 'orm'
      ? SQLALCHEMY_ORM_PY
      : RAILWAY_TOML;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback omitted in restricted iframes
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Stack Recommendation Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            01. Recommended Lean Stack for Railway
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Optimized for low memory overhead, rapid HTML/JSON-LD extraction, and unified Railway deployment.
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {STACK_RECOMMENDATION.map((row) => (
            <div
              key={row.layer}
              className="px-5 py-3.5 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 text-xs"
            >
              <div className="md:col-span-3 font-semibold text-slate-900">
                {row.layer}
              </div>
              <div className="md:col-span-4 font-mono font-medium text-teal-800">
                {row.choice}
              </div>
              <div className="md:col-span-5 text-slate-600 leading-relaxed">
                {row.why}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. PostgreSQL Schema + SQLAlchemy ORM + Railway Config */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              02. PostgreSQL Schema & Railway Services
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              JSONB storage for dynamic scraper/tax rules with GIN indexing and composite price_history partitions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
              {(
                [
                  { id: 'sql', label: 'PostgreSQL DDL' },
                  { id: 'orm', label: 'SQLAlchemy 2.0' },
                  { id: 'railway', label: 'railway.toml' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSchemaTab(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    schemaTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 border border-slate-200 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <pre className="p-5 bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed overflow-x-auto max-h-[480px]">
          <code>{activeCode}</code>
        </pre>
      </section>

      {/* 3. MVP Roadmap */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="pb-3 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            03. Phased MVP Implementation Roadmap
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            8-week delivery path from unified Railway Postgres prototype to automated multi-channel alerts.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {MVP_ROADMAP.map((phase) => (
            <div
              key={phase.phase}
              className="p-4 rounded-md border border-slate-200 bg-slate-50/60"
            >
              <div className="text-xs font-mono font-medium text-teal-700">
                {phase.phase}
              </div>
              <h3 className="mt-1 text-sm font-semibold text-slate-900">
                {phase.title}
              </h3>
              <ul className="mt-2.5 space-y-1.5 text-xs text-slate-600">
                {phase.items.map((item, i) => (
                  <li key={i} className="leading-relaxed">
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
