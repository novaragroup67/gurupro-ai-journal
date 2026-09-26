-- Migration: 20260926180000_ai_modul_persistence_metadata.sql
-- Description: AI-2A Modul Ajar: Add optional ai_metadata column to public.moduls for structured provenance & grounding persistence.

ALTER TABLE public.moduls
  ADD COLUMN IF NOT EXISTS ai_metadata JSONB DEFAULT NULL;

-- Index on ai_metadata for auditability and schema version queries
CREATE INDEX IF NOT EXISTS idx_moduls_ai_metadata ON public.moduls USING gin (ai_metadata);

-- Comment describing the canonical structure
COMMENT ON COLUMN public.moduls.ai_metadata IS 'Canonical AI generation metadata: promptVersion, sourceSnapshotIds, schemaVersion, generatedAt, validationStatus, evidenceRefs, structured learningObjectives, activities, and assessment rubrics.';
