-- Migration: 20260930120000_illustration_quality_evaluations.sql
-- Description: VIS-1E Illustration Quality Gate & Evaluation Records
-- Creates the table for storing deterministic and AI semantic quality evaluations
-- bound to exact asset hashes and approved specification versions.

CREATE TABLE IF NOT EXISTS public.illustration_quality_evaluations (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES public.illustration_assets(id) ON DELETE CASCADE,
  generation_id TEXT NOT NULL REFERENCES public.illustration_generations(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  asset_hash TEXT NOT NULL,
  outline_version INTEGER NOT NULL DEFAULT 1,
  style_id TEXT NOT NULL,
  style_version INTEGER NOT NULL DEFAULT 1,
  evaluator_version TEXT NOT NULL DEFAULT 'illustration_quality_v1',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  deterministic_checks JSONB NOT NULL,
  semantic_checks JSONB,
  decision TEXT NOT NULL CHECK (decision IN ('PASS', 'NEEDS_REVISION', 'REJECT', 'ERROR')),
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast querying, filtering by asset, hash, module, plan, decision, and evaluator
CREATE INDEX IF NOT EXISTS idx_ill_qual_asset_id ON public.illustration_quality_evaluations(asset_id);
CREATE INDEX IF NOT EXISTS idx_ill_qual_asset_hash ON public.illustration_quality_evaluations(asset_hash);
CREATE INDEX IF NOT EXISTS idx_ill_qual_plan_id ON public.illustration_quality_evaluations(generation_plan_id);
CREATE INDEX IF NOT EXISTS idx_ill_qual_module_id ON public.illustration_quality_evaluations(module_id);
CREATE INDEX IF NOT EXISTS idx_ill_qual_decision ON public.illustration_quality_evaluations(decision);
CREATE INDEX IF NOT EXISTS idx_ill_qual_eval_by ON public.illustration_quality_evaluations(evaluated_by);
CREATE INDEX IF NOT EXISTS idx_ill_qual_lookup ON public.illustration_quality_evaluations(asset_id, asset_hash, outline_version, style_version, evaluator_version);
CREATE INDEX IF NOT EXISTS idx_ill_qual_created_at ON public.illustration_quality_evaluations(created_at);

-- Enable Row Level Security
ALTER TABLE public.illustration_quality_evaluations ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: Guru can select only evaluations for their own modules/assets
DROP POLICY IF EXISTS "Guru can select own illustration evaluations" ON public.illustration_quality_evaluations;
CREATE POLICY "Guru can select own illustration evaluations"
  ON public.illustration_quality_evaluations
  FOR SELECT
  TO authenticated
  USING (
    evaluated_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 2. INSERT Policy: Guru can insert only evaluations performed by themselves
DROP POLICY IF EXISTS "Guru can insert own illustration evaluations" ON public.illustration_quality_evaluations;
CREATE POLICY "Guru can insert own illustration evaluations"
  ON public.illustration_quality_evaluations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    evaluated_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 3. UPDATE Policy: Guru can update only evaluations performed by themselves
DROP POLICY IF EXISTS "Guru can update own illustration evaluations" ON public.illustration_quality_evaluations;
CREATE POLICY "Guru can update own illustration evaluations"
  ON public.illustration_quality_evaluations
  FOR UPDATE
  TO authenticated
  USING (
    evaluated_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  )
  WITH CHECK (
    evaluated_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 4. DELETE Policy: Guru can delete only evaluations performed by themselves
DROP POLICY IF EXISTS "Guru can delete own illustration evaluations" ON public.illustration_quality_evaluations;
CREATE POLICY "Guru can delete own illustration evaluations"
  ON public.illustration_quality_evaluations
  FOR DELETE
  TO authenticated
  USING (
    evaluated_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );
