# libertas café kiosk

Production kiosk web app for **libertas café** with a static GitHub Pages frontend and a Vercel backend that integrates with Square using the official SDK.

## Architecture

```text
GitHub Pages (static kiosk UI)
        |
        | HTTPS (runtime-selected backend URL, never persisted)
        v
Vercel Serverless API
        |
        | Official Square SDK / APIs
        v
Square (catalog, modifiers, pricing, inventory availability, orders, discounts, payments/POS/KDS workflow)
```

### Source of truth
Square is the source of truth for:
- categories
- catalog items
- item images
- variations/prices
- modifier lists/rules
- availability/inventory signals
- order creation and discount representation

The frontend never stores or trusts authoritative prices/inventory/totals.

## What this repository contains

- `docs/` — static kiosk frontend (GitHub Pages hostable)
- `api/` — Vercel backend routes and Square integration
- `shared/` — reusable order/business validation utilities
- `test/` — focused tests for core business logic
- `.env.example` — required environment variable template

## Kiosk flow

1. Startup backend URL screen (entered every launch, not persisted).
2. Connection test (`/api/health`).
3. Branded welcome screen (`libertas café`) and required customer name.
4. Dynamic menu loaded from Square catalog (`/api/catalog`).
5. Item customization using Square modifier lists/rules.
6. Bag review, quantity edits, payment method selection (cash or star cards).
7. Final confirmation with explicit checkbox before submit.
8. Backend revalidates everything against current Square catalog.
9. Backend creates Square order using idempotency key.
10. Success screen shows for ~3 seconds, then kiosk session resets.

If submission fails, bag contents are preserved for retry/edit.

## Employee workflow (Square POS/KDS)

This repo intentionally does **not** implement a separate cashier app or custom KDS.

Operational flow is through Square’s built-in employee tooling:
- kiosk creates Square orders
- staff uses Square POS to collect payment/mark paid
- kitchen uses Square KDS/POS order workflow for preparation/completion

## Star cards

- Star-card tracking and redemption are handled offline by staff.
- Students turn in physical cards at pickup/cashier.
- No online balance checks or redemptions occur.
- For star-card orders, the backend applies a Square order discount equal to the most expensive item’s unit price.

## Environment variables

Copy `.env.example` to `.env` for local/dev:

- `SQUARE_ENVIRONMENT` — `sandbox` or `production`
- `SQUARE_ACCESS_TOKEN` — Square access token (backend only)
- `SQUARE_LOCATION_ID` — Square location ID
- `SQUARE_CURRENCY` — currency code (default `USD`)
- `FRONTEND_ORIGIN` — GitHub Pages origin for CORS

## Square setup

1. Create Square application in Square Developer Dashboard.
2. Create credentials for target environment (sandbox/production).
3. Grant required permissions for catalog, inventory, orders, and payments.
4. Configure catalog categories/items/variations/images/modifiers in Square.
5. Configure availability/inventory in Square.
6. Put credentials only in Vercel environment variables.

## Local development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run syntax/build validation:

```bash
npm run build
```

Serve static frontend locally:

```bash
npm start
```

Run Vercel local API emulation:

```bash
npm run dev
```

## Deployment

### GitHub Pages (frontend)
- publish `docs/` as the Pages source
- frontend contains no secrets and no embedded backend URL

### Vercel (backend)
- import repository
- configure environment variables from `.env.example`
- deploy serverless API routes under `/api/*`

## API routes

- `GET /api/health` — connectivity check
- `GET /api/catalog` — Square-backed categories/items/modifiers/images/prices/availability
- `POST /api/orders` — validates and submits order to Square

## Testing coverage in this repo

`test/business.test.js` validates:
- modifier min/max/availability checks
- line + order total cent calculations

## Security

- Square credentials are backend-only.
- CORS is controlled by `FRONTEND_ORIGIN`.
- Server-side schema and business validation on every order.
- Idempotency key path to prevent accidental duplicate submissions.
- No secrets are stored in frontend code or browser persistence.

## Troubleshooting

- **Connection test fails**: verify backend URL and Vercel deployment health.
- **Catalog load fails**: confirm Square credentials/scopes/location ID.
- **Order validation fails**: item/modifier/inventory likely changed in Square; refresh and retry.
- **Star-card questions**: confirm staff are collecting physical cards offline and that Square discounts appear on star-card orders.
