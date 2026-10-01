-- Migration: 20260930110000_illustration_reviews.sql
-- Description: VIS-1D Teacher Review & Illustration Management
-- Creates the table for storing teacher review records, decisions, feedback notes,
-- and approval states for permanent illustration assets.

CREATE TABLE IF NOT EXISTS public.illustration_reviews (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL UNIQUE REFERENCES public.illustration_assets(id) ON DELETE CASCADE,
  generation_id TEXT NOT NULL REFERENCES public.illustration_generations(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  outline_version INTEGER NOT NULL DEFAULT 1,
  style_id TEXT NOT NULL,
  style_version INTEGER NOT NULL DEFAULT 1,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed', 'approved_for_use', 'rejected')),
  teacher_decision TEXT CHECK (teacher_decision IN ('use', 'archive', 'regenerate', 'keep_for_later')),
  teacher_notes TEXT,
  reviewed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast querying, filtering by module, plan, review status, and teacher
CREATE INDEX IF NOT EXISTS idx_ill_reviews_asset_id ON public.illustration_reviews(asset_id);
CREATE INDEX IF NOT EXISTS idx_ill_reviews_gen_id ON public.illustration_reviews(generation_id);
CREATE INDEX IF NOT EXISTS idx_ill_reviews_plan_id ON public.illustration_reviews(generation_plan_id);
CREATE INDEX IF NOT EXISTS idx_ill_reviews_module_id ON public.illustration_reviews(module_id);
CREATE INDEX IF NOT EXISTS idx_ill_reviews_status ON public.illustration_reviews(review_status);
CREATE INDEX IF NOT EXISTS idx_ill_reviews_teacher ON public.illustration_reviews(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_ill_reviews_created_at ON public.illustration_reviews(created_at);

-- Enable Row Level Security
ALTER TABLE public.illustration_reviews ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: Guru can select only their own illustration reviews
DROP POLICY IF EXISTS "Guru can select own illustration reviews" ON public.illustration_reviews;
CREATE POLICY "Guru can select own illustration reviews"
  ON public.illustration_reviews
  FOR SELECT
  TO authenticated
  USING (
    reviewed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 2. INSERT Policy: Guru can insert only their own illustration reviews
DROP POLICY IF EXISTS "Guru can insert own illustration reviews" ON public.illustration_reviews;
CREATE POLICY "Guru can insert own illustration reviews"
  ON public.illustration_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 3. UPDATE Policy: Guru can update only their own illustration reviews
DROP POLICY IF EXISTS "Guru can update own illustration reviews" ON public.illustration_reviews;
CREATE POLICY "Guru can update own illustration reviews"
  ON public.illustration_reviews
  FOR UPDATE
  TO authenticated
  USING (
    reviewed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  )
  WITH CHECK (
    reviewed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 4. DELETE Policy: Owner can delete their own review records
DROP POLICY IF EXISTS "Guru can delete own illustration reviews" ON public.illustration_reviews;
CREATE POLICY "Guru can delete own illustration reviews"
  ON public.illustration_reviews
  FOR DELETE
  TO authenticated
  USING (
    reviewed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );
