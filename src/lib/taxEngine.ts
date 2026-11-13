import {
  CountryTaxProfile,
  CurrencyCode,
  NormalizedSourceQuote,
  Product,
  SourceConfig,
} from '../types/market';

// Reference FX rates relative to 1 USD for consistent cross-border comparison
export const FX_RATES_TO_USD: Record<CurrencyCode, number> = {
  USD: 1.0,
  ILS: 0.273, // 1 ILS ≈ 0.273 USD (1 USD ≈ 3.66 ILS)
  EUR: 1.085, // 1 EUR ≈ 1.085 USD
  GBP: 1.275, // 1 GBP ≈ 1.275 USD
};

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  ILS: '₪',
  EUR: '€',
  GBP: '£',
};

export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode
): number {
  if (from === to) return amount;
  const usdValue = amount * FX_RATES_TO_USD[from];
  return usdValue / FX_RATES_TO_USD[to];
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  return `${symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Strips source VAT (if source price is tax-inclusive) to determine true Net Ex-Tax price,
 * then applies buyer's selected jurisdiction VAT + shipping + cross-border import duty
 * to produce the out-the-door Gross price.
 */
export function normalizeSourceQuote(
  source: SourceConfig,
  product: Product,
  buyerProfile: CountryTaxProfile,
  displayCurrency: CurrencyCode
): NormalizedSourceQuote {
  const rawPriceUsd = convertCurrency(source.currentRawPrice, source.currency, 'USD');

  // 1. Strip source VAT if the scraped store displays tax-inclusive pricing
  const netProductUsd = source.taxRules.sourceIncludesTax
    ? rawPriceUsd / (1 + source.taxRules.sourceVatRate)
    : rawPriceUsd;

  const sourceTaxStrippedUsd = rawPriceUsd - netProductUsd;

  // 2. Normalize shipping & handling into USD
  const shippingUsd =
    convertCurrency(
      source.taxRules.shippingCost,
      source.taxRules.shippingCurrency,
      'USD'
    ) + source.taxRules.importHandlingFee;

  // 3. Apply cross-border import duty if source country differs from buyer country
  //    and net value exceeds buyer country de minimis threshold
  const isCrossBorder =
    buyerProfile.code !== 'B2B_EXEMPT' &&
    source.countryCode !== buyerProfile.code;

  const importDutyUsd =
    isCrossBorder &&
    buyerProfile.importDutyRate > 0 &&
    netProductUsd > buyerProfile.importDutyThresholdUsd
      ? netProductUsd * buyerProfile.importDutyRate
      : 0;

  // 4. Apply buyer destination VAT/Sales Tax on (Net Product + Shipping + Duty)
  const taxableBaseUsd = netProductUsd + shippingUsd + importDutyUsd;
  const buyerVatUsd = taxableBaseUsd * buyerProfile.vatRate;
  const grossTotalUsd = taxableBaseUsd + buyerVatUsd;

  // 5. Convert all normalized components to display currency
  const rawPriceInDisplayCurrency = convertCurrency(rawPriceUsd, 'USD', displayCurrency);
  const sourceTaxStripped = convertCurrency(sourceTaxStrippedUsd, 'USD', displayCurrency);
  const netPrice = convertCurrency(netProductUsd, 'USD', displayCurrency);
  const buyerVatAmount = convertCurrency(buyerVatUsd, 'USD', displayCurrency);
  const importDutyAmount = convertCurrency(importDutyUsd, 'USD', displayCurrency);
  const shippingInDisplayCurrency = convertCurrency(shippingUsd, 'USD', displayCurrency);
  const grossPrice = convertCurrency(grossTotalUsd, 'USD', displayCurrency);

  // Own net price comparison
  const ownNetDisplay = convertCurrency(product.ownNetPrice, 'USD', displayCurrency);
  const deltaVsOwnNetPct =
    ownNetDisplay > 0 ? ((netPrice - ownNetDisplay) / ownNetDisplay) * 100 : 0;

  return {
    source,
    rawPriceOriginal: source.currentRawPrice,
    rawPriceInDisplayCurrency,
    sourceTaxStripped,
    netPrice,
    buyerVatAmount,
    importDutyAmount,
    shippingInDisplayCurrency,
    grossPrice,
    deltaVsOwnNetPct,
    deltaVsMarketAvgPct: 0, // Populated once all sources for the product are normalized
  };
}

export function normalizeAllQuotesForProduct(
  sources: SourceConfig[],
  product: Product,
  buyerProfile: CountryTaxProfile,
  displayCurrency: CurrencyCode,
  mode: 'gross' | 'net' | 'both'
): NormalizedSourceQuote[] {
  const quotes = sources.map((s) =>
    normalizeSourceQuote(s, product, buyerProfile, displayCurrency)
  );
  if (quotes.length === 0) return quotes;

  const metricKey = mode === 'net' ? 'netPrice' : 'grossPrice';
  const avg =
    quotes.reduce((sum, q) => sum + q[metricKey], 0) / quotes.length;

  return quotes.map((q) => ({
    ...q,
    deltaVsMarketAvgPct: avg > 0 ? ((q[metricKey] - avg) / avg) * 100 : 0,
  }));
}

export function computeHistoricalPointDisplay(
  netPriceUsd: number,
  source: SourceConfig,
  buyerProfile: CountryTaxProfile,
  displayCurrency: CurrencyCode,
  taxBasis: 'gross' | 'net'
): number {
  if (taxBasis === 'net') {
    return convertCurrency(netPriceUsd, 'USD', displayCurrency);
  }
  const shippingUsd =
    convertCurrency(
      source.taxRules.shippingCost,
      source.taxRules.shippingCurrency,
      'USD'
    ) + source.taxRules.importHandlingFee;

  const isCrossBorder =
    buyerProfile.code !== 'B2B_EXEMPT' &&
    source.countryCode !== buyerProfile.code;

  const importDutyUsd =
    isCrossBorder &&
    buyerProfile.importDutyRate > 0 &&
    netPriceUsd > buyerProfile.importDutyThresholdUsd
      ? netPriceUsd * buyerProfile.importDutyRate
      : 0;

  const grossUsd = (netPriceUsd + shippingUsd + importDutyUsd) * (1 + buyerProfile.vatRate);
  return convertCurrency(grossUsd, 'USD', displayCurrency);
}
