-- Migration: 20261001150000_presentation_artifacts.sql
-- Description: PPT-1C Real PPTX Renderer & Presentation Artifact Engine
-- Creates the table for storing immutable PowerPoint (.pptx) presentation artifacts,
-- cryptographic SHA-256 binary checksums, storage paths, and download references with strict RLS policies.

CREATE TABLE IF NOT EXISTS public.presentation_artifacts (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES public.presentation_generation_requests(id) ON DELETE CASCADE,
  content_result_id TEXT NOT NULL REFERENCES public.presentation_generation_results(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES public.moduls(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  storage_reference TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'supabase_storage',
  public_url TEXT NOT NULL,
  download_url TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  byte_size INTEGER NOT NULL DEFAULT 0,
  file_hash TEXT NOT NULL,
  slide_count INTEGER NOT NULL DEFAULT 1,
  outline_version INTEGER NOT NULL DEFAULT 1,
  style_id TEXT NOT NULL REFERENCES public.generation_styles(id),
  style_version INTEGER NOT NULL DEFAULT 1,
  renderer_version TEXT NOT NULL DEFAULT 'v1.0.0',
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed', 'archived')),
  render_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance and multi-tenant isolation lookup
CREATE INDEX IF NOT EXISTS idx_ppt_artifacts_request_id ON public.presentation_artifacts(request_id);
CREATE INDEX IF NOT EXISTS idx_ppt_artifacts_content_result_id ON public.presentation_artifacts(content_result_id);
CREATE INDEX IF NOT EXISTS idx_ppt_artifacts_plan_id ON public.presentation_artifacts(generation_plan_id);
CREATE INDEX IF NOT EXISTS idx_ppt_artifacts_module_id ON public.presentation_artifacts(module_id);
CREATE INDEX IF NOT EXISTS idx_ppt_artifacts_owner_id ON public.presentation_artifacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_ppt_artifacts_file_hash ON public.presentation_artifacts(file_hash);
CREATE INDEX IF NOT EXISTS idx_ppt_artifacts_status ON public.presentation_artifacts(status);
CREATE INDEX IF NOT EXISTS idx_ppt_artifacts_created_at ON public.presentation_artifacts(created_at);

-- Enable Row Level Security
ALTER TABLE public.presentation_artifacts ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: Guru can select only their own presentation artifacts
DROP POLICY IF EXISTS "Guru can select own presentation artifacts" ON public.presentation_artifacts;
CREATE POLICY "Guru can select own presentation artifacts"
  ON public.presentation_artifacts
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 2. INSERT Policy: Guru can insert own presentation artifacts
DROP POLICY IF EXISTS "Guru can insert own presentation artifacts" ON public.presentation_artifacts;
CREATE POLICY "Guru can insert own presentation artifacts"
  ON public.presentation_artifacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 3. UPDATE Policy: Guru can update own presentation artifacts
DROP POLICY IF EXISTS "Guru can update own presentation artifacts" ON public.presentation_artifacts;
CREATE POLICY "Guru can update own presentation artifacts"
  ON public.presentation_artifacts
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
