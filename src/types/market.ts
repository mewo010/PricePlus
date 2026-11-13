export type TaxViewMode = 'gross' | 'net' | 'both';
export type CurrencyCode = 'USD' | 'ILS' | 'EUR' | 'GBP';
export type RuleEngineType = 'css' | 'jsonld' | 'xpath' | 'regex';
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';
export type AlertChannel = 'push' | 'email' | 'whatsapp' | 'telegram';
export type AlertCondition = 'price_drop_pct' | 'undercut_own_price' | 'target_below' | 'stock_change';

export interface CountryTaxProfile {
  code: string;
  name: string;
  vatRate: number; // e.g., 0.18 for 18%
  importDutyThresholdUsd: number;
  importDutyRate: number; // e.g., 0.12 if applicable above threshold
  defaultCurrency: CurrencyCode;
}

export interface ScraperRulesJsonb {
  engine: RuleEngineType;
  priceSelector: string;
  titleSelector?: string;
  stockSelector?: string;
  outOfStockPattern?: string;
  currencyHint?: CurrencyCode;
  usePlaywrightFallback: boolean;
  userAgentProfile: 'desktop_chrome' | 'mobile_safari' | 'bot_polite';
  requestTimeoutMs: number;
}

export interface TaxRulesJsonb {
  sourceIncludesTax: boolean;
  sourceVatRate: number; // e.g. 0.18, 0.20, 0
  shippingCost: number;
  shippingCurrency: CurrencyCode;
  importHandlingFee: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  ownNetPrice: number; // Seller's own B2B net selling price in USD base
  ownCostBasis: number; // Seller's landed unit cost in USD base (for margin guardrails)
  keywords: string[];
  negativeKeywords: string[];
  createdAt: string;
}

export interface SourceConfig {
  id: string;
  productId: string;
  storeName: string;
  domain: string;
  productUrl: string;
  countryCode: string; // e.g., IL, US, DE, UK
  currency: CurrencyCode;
  isActive: boolean;
  scanIntervalHours: number;
  scraperRules: ScraperRulesJsonb;
  taxRules: TaxRulesJsonb;
  lastScrapedAt: string;
  lastStatus: 'ok' | 'blocked' | 'parse_warning';
  currentRawPrice: number;
  currentStock: StockStatus;
  colorToken: string;
}

export interface PriceHistoryPoint {
  id: string;
  sourceConfigId: string;
  productId: string;
  scrapedAt: string; // ISO date or timestamp
  rawPrice: number;
  currency: CurrencyCode;
  netPriceUsd: number;
  grossPriceUsd: number;
  stockStatus: StockStatus;
}

export interface AlertRule {
  id: string;
  productId: string;
  name: string;
  condition: AlertCondition;
  thresholdValue: number; // % drop or price floor or % undercut
  taxBasis: 'gross' | 'net';
  channels: AlertChannel[];
  webhookTarget: string;
  digestEnabled: boolean;
  isActive: boolean;
  lastTriggeredAt: string | null;
}

export interface NormalizedSourceQuote {
  source: SourceConfig;
  rawPriceOriginal: number;
  rawPriceInDisplayCurrency: number;
  sourceTaxStripped: number;
  netPrice: number;
  buyerVatAmount: number;
  importDutyAmount: number;
  shippingInDisplayCurrency: number;
  grossPrice: number;
  deltaVsOwnNetPct: number;
  deltaVsMarketAvgPct: number;
}

export interface ScrapeTestRequest {
  url?: string;
  htmlSnippet?: string;
  engine: 'css' | 'jsonld' | 'regex';
  priceSelector: string;
  titleSelector?: string;
  negativeKeywords: string[];
  sourceIncludesTax: boolean;
  sourceVatRate: number;
  targetVatRate: number;
  shippingCost: number;
  currency: CurrencyCode;
}

export interface ScrapeTestResult {
  success: boolean;
  fetchedFrom: 'live_url' | 'html_snippet';
  httpStatus?: number;
  extractedTitle: string;
  negativeMatchFound: string | null;
  rawMatchedText: string;
  rawPrice: number | null;
  currency: CurrencyCode;
  netPrice: number | null;
  taxAmount: number | null;
  grossPrice: number | null;
  inStock: boolean;
  durationMs: number;
  diagnostics: string[];
}

export interface MarketStatePayload {
  products: Product[];
  sources: SourceConfig[];
  history: PriceHistoryPoint[];
  alerts: AlertRule[];
  taxProfiles: CountryTaxProfile[];
}
