# BeadBar — Jewelry Business App

Business management webapp for BLB Jewelry. Tracks products, materials inventory, and P&L.

## Stack

- **Frontend:** Vite + React (JSX, no TypeScript)
- **Database:** Supabase (Postgres)
- **Styles:** Hand-written CSS in `src/index.css` — no framework
- **Deploy:** Vercel

## Local dev

```bash
cp .env.example .env   # fill in Supabase URL + anon key
npm install
npm run dev
```

## Environment variables

| Variable | Where to find |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |

## Database setup

Run `supabase/schema.sql` once in the Supabase SQL Editor. It:
- Creates `materials`, `products`, `inventory`, `sales` tables
- Disables RLS on all four (personal app — add policies if auth is added later)
- Seeds 10 materials from supplier "Gem Packed"
- Seeds the "Mixed Metal A" product

## Project structure

```
src/
  App.jsx                  # Tab shell (Product Builder / Inventory / P&L)
  supabase.js              # Supabase client (reads env vars)
  index.css                # All styles — single file, BEM-ish class names
  components/
    ProductBuilder.jsx     # Tab 1: add/edit/delete products, live cost calc
    InventoryTracker.jsx   # Tab 2: starting qty editing, used/remaining, badges
    PLDashboard.jsx        # Tab 3: log sales, metrics, by-product breakdown
public/
  logo.png                 # BB monogram brand logo
supabase/
  schema.sql               # Full schema + seed data
```

## Data model

**materials** — name (unique), type, size, cost (numeric), supplier, notes

**products** — name, `materials` jsonb `[{mat, qty}, …]`, packaging_cost, price, notes

**inventory** — material_name (FK → materials.name), starting_qty
- `used_qty` is derived at read-time by aggregating sales × product.materials
- Status thresholds: remaining ≤ 0 → Critical | ≤ 10 → Low | else In Stock

**sales** — product_name, units, price_per_unit, cost_per_unit, profit_per_unit, sold_at

## Key business logic

- `total_cost = Σ(material.cost × qty) + packaging_cost`
- `profit = price − total_cost`
- `margin % = profit / price × 100`
- Inventory `used_qty` aggregates across all sales entries for products that use a given material

## Design rules

- Clean, minimal, flat UI — no dark backgrounds
- Neutral warm palette: background `#fafaf9`, cards `#fff`, borders `#e7e5e4`
- All styles live in `src/index.css`; avoid inline styles for anything structural
- No Tailwind, no component library
