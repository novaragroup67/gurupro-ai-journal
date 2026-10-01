-- Migration: 20260930140000_presentation_generation_results.sql
-- Description: PPT-1B Real AI Presentation Content Generation Engine
-- Creates the table for storing validated presentation content packages,
-- generation metadata, validation results, and audit snapshots with strict RLS policies.

CREATE TABLE IF NOT EXISTS public.presentation_generation_results (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES public.presentation_generation_requests(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES public.moduls(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_version INTEGER NOT NULL,
  style_id TEXT NOT NULL REFERENCES public.generation_styles(id),
  style_version INTEGER NOT NULL,
  generator_version TEXT NOT NULL DEFAULT 'v1',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  content_package JSONB NOT NULL,
  validation_result JSONB NOT NULL,
  semantic_decision TEXT NOT NULL CHECK (semantic_decision IN ('PASS', 'REVISE', 'REJECT', 'ERROR')),
  grounding_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('generating', 'validating', 'revising', 'ready', 'failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  generation_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance and multi-tenant isolation lookup
CREATE INDEX IF NOT EXISTS idx_ppt_gen_results_request_id ON public.presentation_generation_results(request_id);
CREATE INDEX IF NOT EXISTS idx_ppt_gen_results_plan_id ON public.presentation_generation_results(generation_plan_id);
CREATE INDEX IF NOT EXISTS idx_ppt_gen_results_module_id ON public.presentation_generation_results(module_id);
CREATE INDEX IF NOT EXISTS idx_ppt_gen_results_owner_id ON public.presentation_generation_results(owner_id);
CREATE INDEX IF NOT EXISTS idx_ppt_gen_results_gen_key ON public.presentation_generation_results(generation_key);
CREATE INDEX IF NOT EXISTS idx_ppt_gen_results_status ON public.presentation_generation_results(status);

-- Enable Row Level Security
ALTER TABLE public.presentation_generation_results ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: Guru can select only their own presentation generation results
DROP POLICY IF EXISTS "Guru can select own presentation generation results" ON public.presentation_generation_results;
CREATE POLICY "Guru can select own presentation generation results"
  ON public.presentation_generation_results
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 2. INSERT Policy: Guru can insert their own presentation generation results
DROP POLICY IF EXISTS "Guru can insert own presentation generation results" ON public.presentation_generation_results;
CREATE POLICY "Guru can insert own presentation generation results"
  ON public.presentation_generation_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 3. UPDATE Policy: Guru can update their own presentation generation results
DROP POLICY IF EXISTS "Guru can update own presentation generation results" ON public.presentation_generation_results;
CREATE POLICY "Guru can update own presentation generation results"
  ON public.presentation_generation_results
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

-- 4. DELETE Policy: Guru can delete their own presentation generation results
DROP POLICY IF EXISTS "Guru can delete own presentation generation results" ON public.presentation_generation_results;
CREATE POLICY "Guru can delete own presentation generation results"
  ON public.presentation_generation_results
  FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );
