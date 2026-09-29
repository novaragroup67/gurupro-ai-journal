-- Migration: 20260929100000_ai_publish_and_schema_stabilization.sql
-- Description: AI-4F-A.1 Environment, Schema & Publish Integrity Stabilization
-- Ensures persistent tables, canonical metadata columns, and database-level publish transition guards.

-- 1. PERSISTENT AI SOURCE SNAPSHOTS TABLE
CREATE TABLE IF NOT EXISTS public.ai_source_snapshots (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('text', 'url', 'kurikulum', 'dokumen')),
  source_url TEXT,
  source_title TEXT,
  content_type TEXT NOT NULL DEFAULT 'text/plain',
  content_hash TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  normalized_content TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  char_count INTEGER NOT NULL DEFAULT 0,
  chunks JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingestion_status TEXT NOT NULL DEFAULT 'completed' CHECK (ingestion_status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_ai_source_snapshots_user_id ON public.ai_source_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_source_snapshots_content_hash ON public.ai_source_snapshots(content_hash);
CREATE INDEX IF NOT EXISTS idx_ai_source_snapshots_user_url ON public.ai_source_snapshots(user_id, source_url);
CREATE INDEX IF NOT EXISTS idx_ai_source_snapshots_created_at ON public.ai_source_snapshots(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.ai_source_snapshots ENABLE ROW LEVEL SECURITY;

-- Policy: Teachers can view, insert, update, delete their own snapshots
DROP POLICY IF EXISTS "Guru can select own source snapshots" ON public.ai_source_snapshots;
CREATE POLICY "Guru can select own source snapshots"
  ON public.ai_source_snapshots
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

DROP POLICY IF EXISTS "Guru can insert own source snapshots" ON public.ai_source_snapshots;
CREATE POLICY "Guru can insert own source snapshots"
  ON public.ai_source_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

DROP POLICY IF EXISTS "Guru can update own source snapshots" ON public.ai_source_snapshots;
CREATE POLICY "Guru can update own source snapshots"
  ON public.ai_source_snapshots
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  )
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

DROP POLICY IF EXISTS "Guru can delete own source snapshots" ON public.ai_source_snapshots;
CREATE POLICY "Guru can delete own source snapshots"
  ON public.ai_source_snapshots
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- Policy: Admin read-only audit access
DROP POLICY IF EXISTS "Admin can view all source snapshots for auditing" ON public.ai_source_snapshots;
CREATE POLICY "Admin can view all source snapshots for auditing"
  ON public.ai_source_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 2. CANONICAL AI METADATA COLUMNS
ALTER TABLE public.moduls
  ADD COLUMN IF NOT EXISTS ai_metadata JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_moduls_ai_metadata ON public.moduls USING gin (ai_metadata);

ALTER TABLE public.paket_soal
  ADD COLUMN IF NOT EXISTS ai_metadata JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_paket_soal_ai_metadata ON public.paket_soal USING gin (ai_metadata);

-- 3. DATABASE-LEVEL PUBLISH GUARD FOR PAKET_SOAL
-- Prevents unauthorized or invalid transitions to 'Terbit' directly from client
CREATE OR REPLACE FUNCTION public.guard_paket_soal_publish_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Strict Transition Guard: Draft -> Terbit
  IF OLD.status = 'Draft' AND NEW.status = 'Terbit' THEN
    -- Must have publishedAt and publishedBy in ai_metadata
    IF NEW.ai_metadata IS NULL OR
       (NEW.ai_metadata->>'publishedAt') IS NULL OR
       (NEW.ai_metadata->>'publishedBy') IS NULL THEN
      RAISE EXCEPTION 'Publikasi paket soal ke Bank Soal wajib melalui alur validasi server AI-4F-A (publishQuestionPackageServerFn).';
    END IF;

    -- Ensure publisher matches owner
    IF (NEW.ai_metadata->>'publishedBy')::uuid != OLD.user_id THEN
      RAISE EXCEPTION 'Akses ditolak: Penerbit bukan pemilik draf paket soal.';
    END IF;

    -- Archived package cannot be published
    IF OLD.is_archived IS TRUE THEN
      RAISE EXCEPTION 'Paket soal yang telah diarsipkan tidak dapat dipublikasikan.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_paket_soal_publish ON public.paket_soal;
CREATE TRIGGER trg_guard_paket_soal_publish
  BEFORE UPDATE ON public.paket_soal
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_paket_soal_publish_transition();
