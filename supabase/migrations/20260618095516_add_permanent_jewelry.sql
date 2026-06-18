-- ============================================================
-- Permanent Jewelry — length-based chain inventory + sales
-- ============================================================

-- Chain catalog (length-priced sibling of materials)
create table if not exists chains (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  vendor text,
  metal text,
  cost_per_inch numeric(10,4) not null,
  notes text,
  created_at timestamptz default now()
);

-- Chain purchases — each spool/order bought (adds inventory length + records spend).
-- Remaining length is derived at read time: sum(purchases.length_in) - sum(sales.length_in)
create table if not exists chain_purchases (
  id uuid default gen_random_uuid() primary key,
  chain_name text not null references chains(name) on update cascade,
  length_in numeric(10,2) not null,
  total_cost numeric(10,2) not null,
  purchased_at date default current_date,
  notes text,
  created_at timestamptz default now()
);

-- Permanent jewelry types with length + price estimates (the length estimates)
create table if not exists pj_types (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  default_length_in numeric(10,2) not null default 0,
  default_price numeric(10,2) not null default 0,
  connector_cost numeric(10,2) not null default 0,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Extend sales so a permanent-jewelry sale is a normal 1-unit row.
-- This keeps the P&L Dashboard / by-source / by-event aggregations working unchanged.
alter table sales add column if not exists kind text not null default 'product';  -- 'product' | 'pj'
alter table sales add column if not exists chain_name text;
alter table sales add column if not exists jewelry_type text;
alter table sales add column if not exists length_in numeric(10,2);

-- RLS: authenticated-only, matching materials/products/inventory/sales
alter table chains enable row level security;
alter table chain_purchases enable row level security;
alter table pj_types enable row level security;

drop policy if exists "auth_all_chains" on chains;
drop policy if exists "auth_all_chain_purchases" on chain_purchases;
drop policy if exists "auth_all_pj_types" on pj_types;

create policy "auth_all_chains"          on chains          for all to authenticated using (true) with check (true);
create policy "auth_all_chain_purchases" on chain_purchases for all to authenticated using (true) with check (true);
create policy "auth_all_pj_types"        on pj_types        for all to authenticated using (true) with check (true);

-- Seed the four jewelry types with sensible length estimates (prices are placeholders — edit in-app)
insert into pj_types (name, default_length_in, default_price, connector_cost, sort_order) values
  ('Bracelet', 7,  35, 0.50, 1),
  ('Anklet',   10, 45, 0.50, 2),
  ('Necklace', 18, 70, 0.50, 3),
  ('Ring',     3,  25, 0.50, 4)
on conflict (name) do nothing;
