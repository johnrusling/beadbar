-- Run in Supabase SQL Editor to add photo support

ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_url text;

-- Storage bucket setup (run these too):
-- 1. Go to Supabase → Storage → New bucket
-- 2. Name: product-photos, toggle Public ON → Create
-- Or run the SQL below if you have storage admin rights:

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY IF NOT EXISTS "public read product photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-photos');

CREATE POLICY IF NOT EXISTS "anon upload product photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-photos');

CREATE POLICY IF NOT EXISTS "anon delete product photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-photos');
