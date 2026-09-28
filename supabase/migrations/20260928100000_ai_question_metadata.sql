-- Migration: Add ai_metadata column to public.paket_soal for AI Question package provenance & grounding audit
-- Date: 2026-09-28
-- Description: AI-4A Question Foundation: Add optional ai_metadata column to public.paket_soal for structured provenance & grounding persistence.

ALTER TABLE public.paket_soal
  ADD COLUMN IF NOT EXISTS ai_metadata JSONB DEFAULT NULL;

-- Index on ai_metadata for auditability and schema version queries
CREATE INDEX IF NOT EXISTS idx_paket_soal_ai_metadata ON public.paket_soal USING gin (ai_metadata);

COMMENT ON COLUMN public.paket_soal.ai_metadata IS 'Canonical AI question generation metadata: promptVersion, sourceSnapshotIds, schemaVersion, generatedAt, validationStatus, evidenceRefs, and teacher edit audit.';
