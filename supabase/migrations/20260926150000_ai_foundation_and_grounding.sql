-- Migration: 20260926150000_ai_foundation_and_grounding.sql
-- Description: AI-0 Foundation: persistent source snapshots, content hashing, chunking, and tenant-safe RLS.

CREATE TABLE IF NOT EXISTS public.ai_source_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Policy: Teachers can view and manage their own snapshots
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
