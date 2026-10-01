-- Migration: 20260930100000_illustration_assets.sql
-- Description: VIS-1C Asset Persistence + Provenance + Lifecycle
-- Creates the table for storing permanent illustration assets, cryptographic content hashes (SHA-256),
-- storage paths/URLs, lifecycle state transitions, module section attachments, and full provenance metadata.

CREATE TABLE IF NOT EXISTS public.illustration_assets (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL REFERENCES public.illustration_generations(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL REFERENCES public.illustration_generation_requests(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sha256_hash TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'supabase_storage',
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  width INTEGER NOT NULL DEFAULT 1024,
  height INTEGER NOT NULL DEFAULT 1024,
  byte_size INTEGER NOT NULL DEFAULT 0,
  lifecycle_status TEXT NOT NULL DEFAULT 'staged' CHECK (lifecycle_status IN ('staged', 'attached', 'superseded', 'archived', 'soft_deleted')),
  attached_section_id TEXT,
  attached_at TIMESTAMPTZ,
  style_id TEXT NOT NULL,
  style_version INTEGER NOT NULL DEFAULT 1,
  style_name TEXT NOT NULL,
  prompt_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  grounding_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  pedagogical_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast querying, filtering by module, section, lifecycle status, and hash deduplication
CREATE INDEX IF NOT EXISTS idx_ill_assets_generation_id ON public.illustration_assets(generation_id);
CREATE INDEX IF NOT EXISTS idx_ill_assets_request_id ON public.illustration_assets(request_id);
CREATE INDEX IF NOT EXISTS idx_ill_assets_plan_id ON public.illustration_assets(generation_plan_id);
CREATE INDEX IF NOT EXISTS idx_ill_assets_module_id ON public.illustration_assets(module_id);
CREATE INDEX IF NOT EXISTS idx_ill_assets_owner_id ON public.illustration_assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_ill_assets_attached_section ON public.illustration_assets(attached_section_id);
CREATE INDEX IF NOT EXISTS idx_ill_assets_lifecycle_status ON public.illustration_assets(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_ill_assets_sha256_hash ON public.illustration_assets(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_ill_assets_created_at ON public.illustration_assets(created_at);

-- Enable Row Level Security
ALTER TABLE public.illustration_assets ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: Guru can select only their own illustration assets
DROP POLICY IF EXISTS "Guru can select own illustration assets" ON public.illustration_assets;
CREATE POLICY "Guru can select own illustration assets"
  ON public.illustration_assets
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 2. INSERT Policy: Guru can insert only their own illustration assets
DROP POLICY IF EXISTS "Guru can insert own illustration assets" ON public.illustration_assets;
CREATE POLICY "Guru can insert own illustration assets"
  ON public.illustration_assets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 3. UPDATE Policy: Guru can update only their own illustration assets
DROP POLICY IF EXISTS "Guru can update own illustration assets" ON public.illustration_assets;
CREATE POLICY "Guru can update own illustration assets"
  ON public.illustration_assets
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  )
  WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 4. DELETE Policy: Soft-delete is enforced at application layer, but hard delete restricted to owner
DROP POLICY IF EXISTS "Guru can delete own illustration assets" ON public.illustration_assets;
CREATE POLICY "Guru can delete own illustration assets"
  ON public.illustration_assets
  FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );
