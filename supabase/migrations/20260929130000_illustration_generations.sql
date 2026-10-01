-- Migration: 20260929130000_illustration_generations.sql
-- Description: VIS-1B Real AI Illustration Generation Engine
-- Creates the table for storing real generated illustration artifacts, technical metadata,
-- status lifecycles, and audit details with strict RLS policies bound to authenticated guru ownership.

CREATE TABLE IF NOT EXISTS public.illustration_generations (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES public.illustration_generation_requests(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_request_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  asset_url TEXT,
  image_data TEXT,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  width INTEGER NOT NULL DEFAULT 1024,
  height INTEGER NOT NULL DEFAULT 1024,
  byte_size INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance and query optimization
CREATE INDEX IF NOT EXISTS idx_ill_generations_request_id ON public.illustration_generations(request_id);
CREATE INDEX IF NOT EXISTS idx_ill_generations_plan_id ON public.illustration_generations(generation_plan_id);
CREATE INDEX IF NOT EXISTS idx_ill_generations_owner_id ON public.illustration_generations(owner_id);
CREATE INDEX IF NOT EXISTS idx_ill_generations_status ON public.illustration_generations(status);
CREATE INDEX IF NOT EXISTS idx_ill_generations_created_at ON public.illustration_generations(created_at);

-- Enable Row Level Security
ALTER TABLE public.illustration_generations ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: Guru can select only their own illustration generations
DROP POLICY IF EXISTS "Guru can select own illustration generations" ON public.illustration_generations;
CREATE POLICY "Guru can select own illustration generations"
  ON public.illustration_generations
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 2. INSERT Policy: Guru can insert their own illustration generations
DROP POLICY IF EXISTS "Guru can insert own illustration generations" ON public.illustration_generations;
CREATE POLICY "Guru can insert own illustration generations"
  ON public.illustration_generations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'guru'
    )
  );

-- 3. UPDATE Policy: Guru can update their own illustration generations
DROP POLICY IF EXISTS "Guru can update own illustration generations" ON public.illustration_generations;
CREATE POLICY "Guru can update own illustration generations"
  ON public.illustration_generations
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
