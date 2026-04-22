-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  location text,
  event_date date,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE events DISABLE ROW LEVEL SECURITY;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'General';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id);
