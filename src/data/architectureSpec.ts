export const STACK_RECOMMENDATION = [
  {
    layer: 'Web API & Auth',
    choice: 'FastAPI (Python 3.12) + Pydantic v2',
    why: 'Async I/O native, auto-generates OpenAPI docs, zero-overhead JSONB validation, and shares Python scraper modules directly with background workers.',
  },
  {
    layer: 'Frontend Client',
    choice: 'React 19 + TypeScript + Vite + Tailwind CSS',
    why: 'Sub-second client-side Gross/Net recalculation without round-tripping to the server, static bundle served cleanly by FastAPI or a lightweight Caddy/Node service.',
  },
  {
    layer: 'Lightweight Scraper',
    choice: 'httpx (HTTP/2) + selectolax / BeautifulSoup4 + extruct',
    why: 'Parses static HTML & JSON-LD (<script type="application/ld+json">) at ~15ms per page with <40MB RAM—ideal for Railway worker containers.',
  },
  {
    layer: 'JS-Heavy Fallback',
    choice: 'Playwright (Chromium) isolated Worker Queue',
    why: 'Only invoked when source_configs.scraper_rules->>"usePlaywrightFallback" = true or HTTP 403/JS challenge is detected, keeping baseline memory low.',
  },
  {
    layer: 'Database & Queue',
    choice: 'Railway PostgreSQL Plugin + ARQ / APScheduler',
    why: 'Single unified Postgres instance handles relational entities, JSONB scraper/tax configs, time-series price_history, and lightweight job locking (SKIP LOCKED).',
  },
];

export const POSTGRES_SCHEMA_SQL = `-- PriceLedger PostgreSQL 16 Schema (Railway Managed Plugin)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users & Workspace Tax Preferences
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  persona           TEXT NOT NULL CHECK (persona IN ('consumer', 'salesperson', 'admin')),
  default_country   CHAR(5) NOT NULL DEFAULT 'IL',        -- Target tax jurisdiction
  default_currency  CHAR(3) NOT NULL DEFAULT 'USD',
  preferred_mode    TEXT NOT NULL DEFAULT 'gross' CHECK (preferred_mode IN ('gross', 'net', 'both')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tracked Products (SKU, Match Keywords, Negative Keyword Exclusions)
CREATE TABLE products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku                TEXT NOT NULL,
  name               TEXT NOT NULL,
  brand              TEXT,
  own_net_price      NUMERIC(12, 2),                      -- User's own B2B ex-tax price
  own_cost_basis     NUMERIC(12, 2),                      -- Margin floor guardrail
  keywords           TEXT[] NOT NULL DEFAULT '{}',
  negative_keywords  TEXT[] NOT NULL DEFAULT '{}',        -- e.g. {'case','cable','refurbished'}
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, sku)
);

-- 3. Source Configurations (JSONB for Scraper Selectors + Per-Source Tax Rules)
CREATE TABLE source_configs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_name          TEXT NOT NULL,
  domain              TEXT NOT NULL,
  product_url         TEXT NOT NULL,
  country_code        CHAR(5) NOT NULL,                   -- Origin jurisdiction (IL, UK, DE, US_NY)
  currency            CHAR(3) NOT NULL,                   -- Store native currency
  scan_interval_hours INT NOT NULL DEFAULT 6,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,

  -- Flexible CSS / XPath / JSON-LD / Regex extraction rules
  scraper_rules       JSONB NOT NULL,
  /* Example scraper_rules:
     {
       "engine": "jsonld",
       "priceSelector": "script[type='application/ld+json'] -> offers.price",
       "titleSelector": "h1.product-title",
       "stockSelector": ".stock-indicator",
       "outOfStockPattern": "Out of stock",
       "usePlaywrightFallback": false,
       "requestTimeoutMs": 8000
     }
  */

  -- Per-source tax & landed shipping rules
  tax_rules           JSONB NOT NULL,
  /* Example tax_rules:
     {
       "sourceIncludesTax": true,
       "sourceVatRate": 0.18,
       "shippingCost": 29.00,
       "shippingCurrency": "ILS",
       "importHandlingFee": 0
     }
  */

  last_scraped_at     TIMESTAMPTZ,
  last_status         TEXT DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_source_configs_rules_gin ON source_configs USING GIN (scraper_rules);
CREATE INDEX idx_source_configs_active_scan ON source_configs (is_active, last_scraped_at);

-- 4. Time-Series Price History (Raw, Stripped Net, and Normalized Gross)
CREATE TABLE price_history (
  id               BIGSERIAL PRIMARY KEY,
  source_config_id UUID NOT NULL REFERENCES source_configs(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  raw_price        NUMERIC(12, 2) NOT NULL,               -- Exact price scraped in source currency
  currency         CHAR(3) NOT NULL,
  net_price        NUMERIC(12, 2) NOT NULL,               -- Normalized ex-tax price (USD base)
  gross_price      NUMERIC(12, 2) NOT NULL,               -- Normalized incl-tax + shipping (USD base)
  tax_amount       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  shipping_cost    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  stock_status     TEXT NOT NULL CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock')),
  scraped_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_history_product_time ON price_history (product_id, scraped_at DESC);
CREATE INDEX idx_price_history_source_time  ON price_history (source_config_id, scraped_at DESC);

-- 5. Smart Alerts & 24h Digest Subscriptions
CREATE TABLE alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  condition         TEXT NOT NULL CHECK (condition IN ('price_drop_pct', 'undercut_own_price', 'target_below', 'stock_change')),
  threshold_value   NUMERIC(10, 2) NOT NULL,
  tax_basis         TEXT NOT NULL DEFAULT 'gross' CHECK (tax_basis IN ('gross', 'net')),
  channels          TEXT[] NOT NULL DEFAULT '{email}',    -- {'push','email','whatsapp','telegram'}
  webhook_target    TEXT,
  digest_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;

export const SQLALCHEMY_ORM_PY = `# app/models.py — SQLAlchemy 2.0 Async ORM for FastAPI + Railway Postgres
from datetime import datetime
from decimal import Decimal
import uuid
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    persona: Mapped[str] = mapped_column(String(20), default="salesperson")
    default_country: Mapped[str] = mapped_column(String(5), default="IL")
    preferred_mode: Mapped[str] = mapped_column(String(10), default="gross")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Product(Base):
    __tablename__ = "products"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    sku: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    own_net_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    own_cost_basis: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    keywords: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    negative_keywords: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    sources: Mapped[list["SourceConfig"]] = relationship(back_populates="product", cascade="all, delete-orphan")

class SourceConfig(Base):
    __tablename__ = "source_configs"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    store_name: Mapped[str] = mapped_column(String(120), nullable=False)
    product_url: Mapped[str] = mapped_column(Text, nullable=False)
    country_code: Mapped[str] = mapped_column(String(5), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    scan_interval_hours: Mapped[int] = mapped_column(Integer, default=6)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    scraper_rules: Mapped[dict] = mapped_column(JSONB, nullable=False)
    tax_rules: Mapped[dict] = mapped_column(JSONB, nullable=False)
    last_scraped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    product: Mapped["Product"] = relationship(back_populates="sources")

class PriceHistory(Base):
    __tablename__ = "price_history"
    __table_args__ = (Index("idx_price_history_product_time", "product_id", "scraped_at"),)
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    source_config_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("source_configs.id", ondelete="CASCADE"))
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    raw_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    net_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    gross_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    stock_status: Mapped[str] = mapped_column(String(20), nullable=False)
    scraped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())`;

export const RAILWAY_TOML = `# railway.toml — Monorepo multi-service setup sharing one Railway Postgres plugin
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

# Service 1: "web" — FastAPI + Built React Static Assets
# Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
# Env Vars:
#   DATABASE_URL = \${{Postgres.DATABASE_URL}}
#   PLAYWRIGHT_WORKER_URL = http://playwright-worker.railway.internal:8001

# Service 2: "scraper-worker" — Continuous Scheduler & HTTP/HTML + Alert Dispatcher
# Start Command: python -m app.worker.scheduler
# Env Vars:
#   DATABASE_URL = \${{Postgres.DATABASE_URL}}
#   TELEGRAM_BOT_TOKEN = \${{shared.TELEGRAM_BOT_TOKEN}}

# Service 3 (Optional): "playwright-worker" — Headless Chromium Fallback
# Built from mcr.microsoft.com/playwright/python:v1.48.0-jammy
# Only runs on private internal DNS (*.railway.internal) to isolate RAM usage.`;

export const MVP_ROADMAP = [
  {
    phase: 'Phase 1 · Weeks 1–2',
    title: 'Core Scraper & Tax Normalization Engine',
    items: [
      'Provision Railway Project + PostgreSQL Plugin + FastAPI skeleton with Alembic migrations.',
      'Implement httpx + selectolax/JSON-LD extraction pipeline with negative-keyword filtering.',
      'Build deterministic Tax & FX Engine storing raw_price, net_price, and gross_price in price_history.',
    ],
  },
  {
    phase: 'Phase 2 · Weeks 3–4',
    title: 'Comparison Matrix, Charts & Gross/Net Toggle',
    items: [
      'Ship React + Tailwind dashboard with global Gross / Net / Side-by-Side segmented switch.',
      'Implement multi-store comparison table with % delta vs. own price and market average.',
      'Add interactive 7D / 30D / All-Time price history chart and mobile-first Sales Call Mode.',
    ],
  },
  {
    phase: 'Phase 3 · Weeks 5–6',
    title: 'Background Worker, Cron & Playwright Fallback',
    items: [
      'Deploy dedicated Railway scraper-worker service polling due source_configs via SELECT ... FOR UPDATE SKIP LOCKED.',
      'Add containerized Playwright microservice on Railway private networking for JS-rendered storefronts.',
      'Implement live URL Selector Sandbox so users can validate CSS/JSON-LD rules before saving.',
    ],
  },
  {
    phase: 'Phase 4 · Weeks 7–8',
    title: 'Smart Alerts, Webhooks & 24h Digests',
    items: [
      'Evaluate alert rules (price drop %, competitor undercut, stock transitions) right after each scrape commit.',
      'Wire Telegram Bot API, WhatsApp Business webhook, and transactional Email (Resend/Postmark).',
      'Schedule Railway daily 08:00 UTC Cron job to compile and dispatch 24-hour market digest summaries.',
    ],
  },
];
