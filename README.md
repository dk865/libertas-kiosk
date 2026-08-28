# libertas café kiosk

Production kiosk web app for **libertas café**, hosted as one Vercel application with a static frontend and serverless Square integration.

## Architecture

```text
Vercel (static kiosk UI + serverless API)
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

- `docs/` — static kiosk frontend served at the Vercel application root
- `api/` — Vercel backend routes and Square integration
- `shared/` — reusable order/business validation utilities
- `test/` — focused tests for core business logic
- `.env.example` — required environment variable template

## Kiosk flow

1. Server-side kiosk password screen.
2. Branded welcome screen (`libertas café`) and required customer name.
3. Dynamic menu loaded from Square catalog (`/api/catalog`).
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
- `KIOSK_PASSWORD` — kiosk password, server-only
- `KIOSK_SESSION_SECRET` — long random secret used to sign kiosk sessions, server-only

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

### Vercel
- import the repository root
- configure environment variables from `.env.example`
- Vercel serves `docs/` at `/` through `vercel.json` and detects `api/` functions automatically

## API routes

- `POST /api/auth` — creates the authenticated kiosk session cookie
- `GET /api/health` — connectivity check
- `GET /api/catalog` — Square-backed categories/items/modifiers/images/prices/availability
- `POST /api/orders` — validates and submits order to Square

## Testing coverage in this repo

`test/business.test.js` validates:
- modifier min/max/availability checks
- line + order total cent calculations

## Security

- Square credentials are backend-only.
- The kiosk and API use the same origin; catalog and orders require a signed HttpOnly session cookie.
- Server-side schema and business validation on every order.
- Idempotency key path to prevent accidental duplicate submissions.
- No secrets are stored in frontend code or browser persistence.

## Troubleshooting

- **Kiosk unlock fails**: verify `KIOSK_PASSWORD` and `KIOSK_SESSION_SECRET` in the Vercel environment.
- **Catalog load fails**: confirm Square credentials/scopes/location ID.
- **Order validation fails**: item/modifier/inventory likely changed in Square; refresh and retry.
- **Star-card questions**: confirm staff are collecting physical cards offline and that Square discounts appear on star-card orders.
