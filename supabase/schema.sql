-- ============================================================
-- BeadBar Schema — run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS materials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  type text,
  size text,
  cost numeric(10,4) NOT NULL,
  supplier text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  materials jsonb DEFAULT '[]'::jsonb,
  packaging_cost numeric(10,4) DEFAULT 0,
  price numeric(10,4) NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  material_name text NOT NULL UNIQUE REFERENCES materials(name) ON UPDATE CASCADE,
  starting_qty numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name text NOT NULL,
  units integer NOT NULL,
  price_per_unit numeric(10,4) NOT NULL,
  cost_per_unit numeric(10,4) NOT NULL,
  profit_per_unit numeric(10,4) NOT NULL,
  sold_at timestamptz DEFAULT now()
);

-- Disable RLS (personal app — re-enable and add policies if you add auth later)
ALTER TABLE materials DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- Seed: Materials from Gem Packed
-- ============================================================
INSERT INTO materials (name, cost, supplier) VALUES
  ('Gold Bead 2mm',       0.1320, 'Gem Packed'),
  ('Gold Bead 3mm',       0.2490, 'Gem Packed'),
  ('Gold Crimp Bead 3mm', 0.4390, 'Gem Packed'),
  ('SS Crimp Bead 3mm',   0.2680, 'Gem Packed'),
  ('SS 2mm Bead',         0.0976, 'Gem Packed'),
  ('SS 3mm Bead',         0.2360, 'Gem Packed'),
  ('GF End Cap 1.1mm',    1.6900, 'Gem Packed'),
  ('GF End Cap 0.48mm',   0.3840, 'Gem Packed'),
  ('SS End Cap 0.48mm',   0.2940, 'Gem Packed'),
  ('GF 24G Round Wire',   0.9500, 'Gem Packed')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Seed: Product — Mixed Metal A
-- Cost breakdown:
--   SS End Cap 0.48mm ×2  = $0.588
--   SS Crimp Bead 3mm ×2  = $0.536
--   SS 3mm Bead ×10       = $2.360
--   Gold Bead 2mm ×18     = $2.376
--   Total cost             = $5.860  |  Margin ~70.7%
-- ============================================================
INSERT INTO products (name, materials, packaging_cost, price) VALUES (
  'Mixed Metal A',
  '[
    {"mat": "SS End Cap 0.48mm",  "qty": 2},
    {"mat": "SS Crimp Bead 3mm",  "qty": 2},
    {"mat": "SS 3mm Bead",        "qty": 10},
    {"mat": "Gold Bead 2mm",      "qty": 18}
  ]'::jsonb,
  0,
  20.00
) ON CONFLICT DO NOTHING;
