-- Run in Supabase SQL Editor to add time tracking

CREATE TABLE IF NOT EXISTS time_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name text NOT NULL,
  time_minutes integer NOT NULL CHECK (time_minutes > 0),
  notes text,
  worked_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE time_entries DISABLE ROW LEVEL SECURITY;
