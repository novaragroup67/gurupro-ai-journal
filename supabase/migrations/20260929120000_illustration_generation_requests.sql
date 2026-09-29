-- Migration: 20260929120000_illustration_generation_requests.sql
-- Description: VIS-1A Illustration Generation Contract & Request Builder
-- Creates the table for storing prepared and validated illustration generation requests
-- with strict RLS policies bound to authenticated guru ownership.

CREATE TABLE IF NOT EXISTS public.illustration_generation_requests (
  id TEXT PRIMARY KEY,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  approved_version INTEGER NOT NULL,
  style_id TEXT NOT NULL REFERENCES public.generation_styles(id),
  style_version INTEGER NOT NULL,
  request_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'submitted', 'processing', 'succeeded', 'failed', 'cancelled')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ill_gen_requests_plan_id ON public.illustration_generation_requests(generation_plan_id);
CREATE INDEX IF NOT EXISTS idx_ill_gen_requests_created_by ON public.illustration_generation_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_ill_gen_requests_status ON public.illustration_generation_requests(status);

-- Enable Row Level Security
ALTER TABLE public.illustration_generation_requests ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: Guru can select only their own generation requests
DROP POLICY IF EXISTS "Guru can select own illustration generation requests" ON public.illustration_generation_requests;
CREATE POLICY "Guru can select own illustration generation requests"
  ON public.illustration_generation_requests
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 2. INSERT Policy: Guru can insert their own generation requests
DROP POLICY IF EXISTS "Guru can insert own illustration generation requests" ON public.illustration_generation_requests;
CREATE POLICY "Guru can insert own illustration generation requests"
  ON public.illustration_generation_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 3. UPDATE Policy: Guru can update their own generation requests
DROP POLICY IF EXISTS "Guru can update own illustration generation requests" ON public.illustration_generation_requests;
CREATE POLICY "Guru can update own illustration generation requests"
  ON public.illustration_generation_requests
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  )
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );
