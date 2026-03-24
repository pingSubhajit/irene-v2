<p align="center">
  <img src="./packages/assets/images/logo.svg" alt="Irene logo" width="88" />
</p>

# Irene

Irene is a private, inbox-native personal finance app. It turns finance-related emails and attachments into a structured ledger, recurring obligations, forecasts, review items, and planning guidance.

## What Irene does

- Syncs finance-relevant messages from Gmail
- Extracts structured purchase, bill, refund, transfer, income, and subscription signals
- Reconciles raw signals into canonical financial events
- Resolves merchants, categories, and payment instruments
- Builds recurring obligations, forecasts, memory, and advice on top of the ledger
- Keeps uncertain cases visible through a review-first workflow

> [!IMPORTANT]
> Irene is designed as a private authenticated app, not a public multi-tenant SaaS. End-to-end local development needs Postgres, Redis, Google OAuth, object storage, and AI credentials.

## Workspace layout

```text
apps/
  web/        Next.js 16 app router frontend and internal APIs
  worker/     BullMQ worker for ingestion, extraction, reconciliation, forecast, and advice jobs
packages/
  ai/         Model prompts, routing, extraction, and structured output helpers
  assets/     Shared logos and images
  config/     Runtime env loading and validation
  db/         Drizzle schema, queries, and migrations
  integrations/ Google, storage, FX, and external service clients
  observability/ Logging and instrumentation
  ui/         Shared UI components and styles
  workflows/  Queue names, payload schemas, and enqueue helpers
docs/
  technical-architecture.md
  implementation-plan.md
  schema-design.md
```

## Stack

- Next.js 16 + React 19
- TypeScript monorepo with pnpm workspaces and Turbo
- Postgres + Drizzle ORM
- Redis + BullMQ
- Better Auth with Google sign-in
- Google Cloud Storage for private document storage
- AI Gateway-backed extraction and classification workflows

## Getting started

### 1. Prerequisites

- Node.js 20+
- pnpm 9+
- Postgres
- Redis or Upstash Redis
- Google OAuth credentials
- A private Google Cloud Storage bucket
- AI Gateway credentials

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

Copy the example file and fill in the real values:

```bash
cp .env.example .env
```

At minimum, configure these groups:

- Database: `DATABASE_URL`, `DATABASE_URL_DIRECT`
- Auth: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Security: `APP_ENCRYPTION_KEY`
- Storage: `GCS_BUCKET`, `GCS_PROJECT_ID`, `GCS_CLIENT_EMAIL`, `GCS_PRIVATE_KEY`
- AI: `AI_GATEWAY_API_KEY`, `LOGO_DOT_DEV_SECRET_KEY`, `NEXT_PUBLIC_LOGO_DOT_DEV_PUBLIC_KEY`
- Redis: `UPSTASH_REDIS_HOST`, `UPSTASH_REDIS_PORT`, `UPSTASH_REDIS_PASSWORD`
- Optional but useful: `CURRENCYAPI_API_KEY`, `CRON_SECRET`

> [!NOTE]
> The runtime config currently expects `LOGO_DOT_DEV_SECRET_KEY` and `NEXT_PUBLIC_LOGO_DOT_DEV_PUBLIC_KEY`, even though they are not listed in `.env.example` yet.

### 4. Run database migrations

```bash
pnpm db:migrate
```

### 5. Start the app

Run both services together:

```bash
pnpm dev
```

Or run them separately:

```bash
pnpm dev:web
pnpm dev:worker
```

The web app runs on [http://localhost:3000](http://localhost:3000).

## Common commands

```bash
pnpm dev             # Run web + worker in development
pnpm dev:web         # Run only the Next.js app
pnpm dev:worker      # Run only the background worker
pnpm build           # Build all workspace packages
pnpm typecheck       # Type-check the whole monorepo
pnpm lint            # Lint all packages
pnpm db:generate     # Generate Drizzle migration files
pnpm db:migrate      # Apply migrations
pnpm worker:smoke    # Enqueue a smoke job through the web app
```

## How the system fits together

1. The web app handles sign-in, dashboard views, review actions, settings, and internal routes.
2. Gmail sync jobs ingest raw documents and attachments.
3. Extraction jobs classify and convert those documents into structured finance signals.
4. Reconciliation jobs merge signals into canonical financial events.
5. Enrichment jobs resolve merchants, categories, instruments, recurring obligations, forecasts, memory, and advice.
6. The UI reads from the canonical ledger and review queue, not directly from raw model output.

## Useful docs

- [Technical architecture](./docs/technical-architecture.md)
- [Implementation plan](./docs/implementation-plan.md)
- [Schema design](./docs/schema-design.md)

## Current product surface

The main authenticated app includes:

- dashboard
- activity and ledger views
- merchant and category detail views
- review queue
- advice
- goals
- settings

The worker currently includes ingestion, extraction, merchant and instrument resolution, reconciliation repair, recurring detection, forecast refresh, advice refresh, and memory learning flows.
