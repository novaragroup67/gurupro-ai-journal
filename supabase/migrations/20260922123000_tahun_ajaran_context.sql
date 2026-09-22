-- Migration: 20260922123000_tahun_ajaran_context.sql
-- Create canonical public.tahun_ajaran table, RLS policies, backfill, and performance index

CREATE TABLE IF NOT EXISTS public.tahun_ajaran (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.tahun_ajaran ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tahun_ajaran' AND policyname = 'Allow read tahun_ajaran'
  ) THEN
    CREATE POLICY "Allow read tahun_ajaran"
      ON public.tahun_ajaran
      FOR SELECT
      TO authenticated, anon
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tahun_ajaran' AND policyname = 'Allow insert tahun_ajaran'
  ) THEN
    CREATE POLICY "Allow insert tahun_ajaran"
      ON public.tahun_ajaran
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tahun_ajaran' AND policyname = 'Allow update tahun_ajaran'
  ) THEN
    CREATE POLICY "Allow update tahun_ajaran"
      ON public.tahun_ajaran
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Backfill existing years from public.kelas
INSERT INTO public.tahun_ajaran (tahun, is_active)
VALUES
  ('2024/2025', false),
  ('2025/2026', false),
  ('2026/2027', true)
ON CONFLICT (tahun) DO NOTHING;

-- Also insert any other distinct years present in kelas table
INSERT INTO public.tahun_ajaran (tahun, is_active)
SELECT DISTINCT tahun_ajaran, false
FROM public.kelas
WHERE tahun_ajaran IS NOT NULL AND tahun_ajaran <> ''
ON CONFLICT (tahun) DO NOTHING;

-- Composite performance index for year-scoped queries on kelas
CREATE INDEX IF NOT EXISTS idx_kelas_guru_tahun ON public.kelas(guru_id, tahun_ajaran);
