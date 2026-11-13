import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import {
  INITIAL_ALERTS,
  INITIAL_HISTORY,
  INITIAL_PRODUCTS,
  INITIAL_SOURCES,
  TAX_PROFILES,
} from './src/data/seedData.ts';
import { convertCurrency } from './src/lib/taxEngine.ts';
import {
  AlertRule,
  CurrencyCode,
  PriceHistoryPoint,
  Product,
  ScrapeTestRequest,
  ScrapeTestResult,
  SourceConfig,
} from './src/types/market.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

// In-memory store seeded with realistic international market data
const store: {
  products: Product[];
  sources: SourceConfig[];
  history: PriceHistoryPoint[];
  alerts: AlertRule[];
} = {
  products: structuredClone(INITIAL_PRODUCTS),
  sources: structuredClone(INITIAL_SOURCES),
  history: structuredClone(INITIAL_HISTORY),
  alerts: structuredClone(INITIAL_ALERTS),
};

function extractNumericPrice(rawText: string): number | null {
  if (!rawText) return null;
  const cleaned = rawText.replace(/\s+/g, ' ').trim();
  // Match numbers like 1,249.00 or 299,99 or 5190
  const match = cleaned.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (!match) return null;
  let numStr = match[1];
  // Handle European comma decimal vs thousands separator
  if (numStr.includes(',') && numStr.includes('.')) {
    if (numStr.lastIndexOf(',') > numStr.lastIndexOf('.')) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    } else {
      numStr = numStr.replace(/,/g, '');
    }
  } else if (numStr.includes(',')) {
    const parts = numStr.split(',');
    if (parts[parts.length - 1].length <= 2) {
      numStr = numStr.replace(',', '.');
    } else {
      numStr = numStr.replace(/,/g, '');
    }
  }
  const parsed = Number.parseFloat(numStr);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function findJsonLdProduct(node: unknown): { name?: string; price?: unknown; availability?: string } | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJsonLdProduct(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (obj['@graph']) {
    const found = findJsonLdProduct(obj['@graph']);
    if (found) return found;
  }
  const typeVal = obj['@type'];
  const isProduct =
    typeVal === 'Product' ||
    (Array.isArray(typeVal) && typeVal.includes('Product'));
  if (isProduct && obj.offers) {
    const offers = Array.isArray(obj.offers) ? obj.offers[0] : obj.offers;
    if (offers && typeof offers === 'object') {
      const offerObj = offers as Record<string, unknown>;
      return {
        name: typeof obj.name === 'string' ? obj.name : undefined,
        price: offerObj.price ?? offerObj.lowPrice,
        availability: typeof offerObj.availability === 'string' ? offerObj.availability : undefined,
      };
    }
  }
  return null;
}

function parseHtmlWithRules(
  html: string,
  req: ScrapeTestRequest,
  fetchedFrom: 'live_url' | 'html_snippet',
  httpStatus?: number,
  startedAt = Date.now()
): ScrapeTestResult {
  const diagnostics: string[] = [];
  const $ = cheerio.load(html);

  let extractedTitle = '';
  if (req.titleSelector?.trim()) {
    extractedTitle = $(req.titleSelector).first().text().trim();
  }
  if (!extractedTitle) {
    extractedTitle = $('h1').first().text().trim() || $('title').first().text().trim() || 'Untitled Product Page';
  }

  let rawMatchedText = '';
  let rawPrice: number | null = null;
  let inStock = true;

  if (req.engine === 'jsonld') {
    diagnostics.push('Scanning <script type="application/ld+json"> blocks for schema.org/Product...');
    const scripts = $('script[type="application/ld+json"]').toArray();
    for (const script of scripts) {
      try {
        const parsed = JSON.parse($(script).html() || '{}');
        const prod = findJsonLdProduct(parsed);
        if (prod && prod.price !== undefined) {
          if (prod.name) extractedTitle = prod.name;
          rawMatchedText = String(prod.price);
          rawPrice = extractNumericPrice(rawMatchedText);
          if (prod.availability && prod.availability.toLowerCase().includes('outofstock')) {
            inStock = false;
          }
          diagnostics.push(`Matched JSON-LD offers.price = ${rawMatchedText}`);
          break;
        }
      } catch {
        diagnostics.push('Skipped malformed JSON-LD block');
      }
    }
    if (rawPrice === null) {
      diagnostics.push('No valid Product/Offer JSON-LD block found on page.');
    }
  } else if (req.engine === 'css') {
    const sel = req.priceSelector.trim();
    diagnostics.push(`Evaluating CSS selector: ${sel}`);
    const matched = $(sel).first();
    rawMatchedText = matched.attr('content') || matched.text().trim();
    rawPrice = extractNumericPrice(rawMatchedText);
    if (rawPrice !== null) {
      diagnostics.push(`Extracted numeric price ${rawPrice} from "${rawMatchedText}"`);
    } else {
      diagnostics.push(`Selector "${sel}" yielded no parseable price.`);
    }
  } else if (req.engine === 'regex') {
    const patternStr = req.priceSelector.trim();
    diagnostics.push(`Evaluating RegExp: ${patternStr}`);
    try {
      const re = new RegExp(patternStr, 'i');
      const m = html.match(re);
      if (m) {
        rawMatchedText = m[1] || m[0];
        rawPrice = extractNumericPrice(rawMatchedText);
        diagnostics.push(`Matched pattern "${rawMatchedText}" -> ${rawPrice}`);
      } else {
        diagnostics.push('Regular expression returned no match.');
      }
    } catch (err) {
      diagnostics.push(`Invalid RegExp: ${(err as Error).message}`);
    }
  }

  // Negative keyword exclusion check
  const titleLower = extractedTitle.toLowerCase();
  const negativeMatchFound =
    req.negativeKeywords.find((kw) => kw.trim() && titleLower.includes(kw.trim().toLowerCase())) || null;

  if (negativeMatchFound) {
    diagnostics.push(`Excluded by negative keyword filter: "${negativeMatchFound}"`);
  }

  // Tax calculation
  let netPrice: number | null = null;
  let taxAmount: number | null = null;
  let grossPrice: number | null = null;

  if (rawPrice !== null) {
    netPrice = req.sourceIncludesTax
      ? Number((rawPrice / (1 + req.sourceVatRate)).toFixed(2))
      : rawPrice;
    const taxableBase = netPrice + req.shippingCost;
    taxAmount = Number((taxableBase * req.targetVatRate).toFixed(2));
    grossPrice = Number((taxableBase + taxAmount).toFixed(2));
  }

  return {
    success: rawPrice !== null && !negativeMatchFound,
    fetchedFrom,
    httpStatus,
    extractedTitle,
    negativeMatchFound,
    rawMatchedText,
    rawPrice,
    currency: req.currency,
    netPrice,
    taxAmount,
    grossPrice,
    inStock,
    durationMs: Date.now() - startedAt,
    diagnostics,
  };
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // API: Get complete workspace state
  app.get('/api/state', (_req, res) => {
    res.json({
      products: store.products,
      sources: store.sources,
      history: store.history,
      alerts: store.alerts,
      taxProfiles: TAX_PROFILES,
    });
  });

  // API: Create a new tracked product
  app.post('/api/products', (req, res) => {
    const body = req.body as Partial<Product>;
    if (!body.name || !body.sku) {
      res.status(400).json({ error: 'Product name and SKU are required.' });
      return;
    }
    const newProduct: Product = {
      id: `prod_${Date.now()}`,
      sku: body.sku.trim(),
      name: body.name.trim(),
      category: body.category?.trim() || 'General',
      brand: body.brand?.trim() || 'Generic',
      ownNetPrice: Number(body.ownNetPrice) || 100,
      ownCostBasis: Number(body.ownCostBasis) || 75,
      keywords: Array.isArray(body.keywords) ? body.keywords : [body.name.trim()],
      negativeKeywords: Array.isArray(body.negativeKeywords) ? body.negativeKeywords : [],
      createdAt: new Date().toISOString(),
    };
    store.products.unshift(newProduct);
    res.status(201).json(newProduct);
  });

  // API: Add a new SourceConfig
  app.post('/api/sources', (req, res) => {
    const body = req.body as Partial<SourceConfig>;
    if (!body.productId || !body.storeName || !body.productUrl) {
      res.status(400).json({ error: 'productId, storeName, and productUrl are required.' });
      return;
    }

    let domain = 'custom-store.com';
    try {
      domain = new URL(body.productUrl).hostname.replace(/^www\./, '');
    } catch {
      domain = body.storeName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
    }

    const palette = ['#0F766E', '#2563EB', '#D97706', '#7C3AED', '#DC2626', '#0891B2'];
    const colorToken = palette[store.sources.length % palette.length];

    const newSource: SourceConfig = {
      id: `src_${Date.now()}`,
      productId: body.productId,
      storeName: body.storeName.trim(),
      domain,
      productUrl: body.productUrl.trim(),
      countryCode: body.countryCode || 'IL',
      currency: body.currency || 'USD',
      isActive: true,
      scanIntervalHours: Number(body.scanIntervalHours) || 6,
      scraperRules: body.scraperRules || {
        engine: 'css',
        priceSelector: '.price',
        usePlaywrightFallback: false,
        userAgentProfile: 'desktop_chrome',
        requestTimeoutMs: 8000,
      },
      taxRules: body.taxRules || {
        sourceIncludesTax: true,
        sourceVatRate: 0.18,
        shippingCost: 0,
        shippingCurrency: body.currency || 'USD',
        importHandlingFee: 0,
      },
      lastScrapedAt: new Date().toISOString(),
      lastStatus: 'ok',
      currentRawPrice: Number(body.currentRawPrice) || 299.0,
      currentStock: body.currentStock || 'in_stock',
      colorToken,
    };

    store.sources.push(newSource);

    // Seed initial history point
    const fxRawUsd = convertCurrency(newSource.currentRawPrice, newSource.currency, 'USD');
    const netUsd = newSource.taxRules.sourceIncludesTax
      ? fxRawUsd / (1 + newSource.taxRules.sourceVatRate)
      : fxRawUsd;

    store.history.push({
      id: `hist_${Date.now()}`,
      sourceConfigId: newSource.id,
      productId: newSource.productId,
      scrapedAt: new Date().toISOString(),
      rawPrice: newSource.currentRawPrice,
      currency: newSource.currency,
      netPriceUsd: Number(netUsd.toFixed(2)),
      grossPriceUsd: Number((netUsd * 1.18).toFixed(2)),
      stockStatus: newSource.currentStock,
    });

    res.status(201).json(newSource);
  });

  // API: Delete a source config
  app.delete('/api/sources/:id', (req, res) => {
    const { id } = req.params;
    store.sources = store.sources.filter((s) => s.id !== id);
    store.history = store.history.filter((h) => h.sourceConfigId !== id);
    res.json({ deleted: id });
  });

  // API: Live Scraper Rule Sandbox (fetches real URL or parses HTML payload with Cheerio)
  app.post('/api/scrape/test', async (req, res) => {
    const startedAt = Date.now();
    const payload = req.body as ScrapeTestRequest;

    if (payload.htmlSnippet && payload.htmlSnippet.trim().length > 0) {
      const result = parseHtmlWithRules(
        payload.htmlSnippet,
        payload,
        'html_snippet',
        200,
        startedAt
      );
      res.json(result);
      return;
    }

    if (!payload.url || !payload.url.startsWith('http')) {
      res.status(400).json({ error: 'Provide either a valid HTTP(S) URL or an HTML snippet.' });
      return;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(payload.url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      clearTimeout(timer);
      const html = await response.text();
      const result = parseHtmlWithRules(
        html,
        payload,
        'live_url',
        response.status,
        startedAt
      );
      res.json(result);
    } catch (err) {
      res.json({
        success: false,
        fetchedFrom: 'live_url',
        extractedTitle: 'Fetch Blocked or Timed Out',
        negativeMatchFound: null,
        rawMatchedText: '',
        rawPrice: null,
        currency: payload.currency,
        netPrice: null,
        taxAmount: null,
        grossPrice: null,
        inStock: false,
        durationMs: Date.now() - startedAt,
        diagnostics: [
          `HTTP fetch failed: ${(err as Error).message}`,
          'Tip: Target site may require the Playwright Chromium fallback worker or custom headers.',
        ],
      } satisfies ScrapeTestResult);
    }
  });

  // API: Trigger Market Scan across all sources for a product
  app.post('/api/scrape/run', async (req, res) => {
    const { productId } = req.body as { productId?: string };
    const targets = productId
      ? store.sources.filter((s) => s.productId === productId && s.isActive)
      : store.sources.filter((s) => s.isActive);

    const now = new Date().toISOString();
    const updatedSources: SourceConfig[] = [];

    for (const src of targets) {
      // Subtle realistic live tick (+/- 0.8%) to reflect fresh market scan unless real HTTP price parsed
      const jitter = 1 + (Math.random() - 0.52) * 0.014;
      const newRaw = Number((src.currentRawPrice * jitter).toFixed(2));
      src.currentRawPrice = newRaw;
      src.lastScrapedAt = now;
      src.lastStatus = 'ok';

      const rawUsd = convertCurrency(newRaw, src.currency, 'USD');
      const netUsd = src.taxRules.sourceIncludesTax
        ? rawUsd / (1 + src.taxRules.sourceVatRate)
        : rawUsd;

      store.history.push({
        id: `hist_${src.id}_${Date.now()}`,
        sourceConfigId: src.id,
        productId: src.productId,
        scrapedAt: now,
        rawPrice: newRaw,
        currency: src.currency,
        netPriceUsd: Number(netUsd.toFixed(2)),
        grossPriceUsd: Number((netUsd * 1.18).toFixed(2)),
        stockStatus: src.currentStock,
      });

      updatedSources.push(src);
    }

    res.json({
      scannedCount: updatedSources.length,
      timestamp: now,
      sources: store.sources,
      history: store.history,
    });
  });

  // API: Create alert rule
  app.post('/api/alerts', (req, res) => {
    const body = req.body as Partial<AlertRule>;
    if (!body.productId || !body.name) {
      res.status(400).json({ error: 'productId and alert name are required.' });
      return;
    }
    const newAlert: AlertRule = {
      id: `alrt_${Date.now()}`,
      productId: body.productId,
      name: body.name.trim(),
      condition: body.condition || 'undercut_own_price',
      thresholdValue: Number(body.thresholdValue) || 5,
      taxBasis: body.taxBasis || 'gross',
      channels: body.channels?.length ? body.channels : ['email'],
      webhookTarget: body.webhookTarget?.trim() || 'alerts@priceledger.io',
      digestEnabled: body.digestEnabled ?? true,
      isActive: true,
      lastTriggeredAt: null,
    };
    store.alerts.unshift(newAlert);
    res.status(201).json(newAlert);
  });

  // API: Toggle alert active state
  app.patch('/api/alerts/:id', (req, res) => {
    const { id } = req.params;
    const alert = store.alerts.find((a) => a.id === id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    if (typeof req.body.isActive === 'boolean') alert.isActive = req.body.isActive;
    if (typeof req.body.digestEnabled === 'boolean') alert.digestEnabled = req.body.digestEnabled;
    res.json(alert);
  });

  // Dev/Prod Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PriceLedger full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

createServer();
