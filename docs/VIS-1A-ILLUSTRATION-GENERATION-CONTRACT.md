# VIS-1A — Illustration Generation Contract & Request Builder Architecture & Technical Report

## 1. Overview & Objectives

**VIS-1A (Illustration Generation Contract & Request Builder)** establishes the strict, provider-agnostic request preparation layer that converts an **APPROVED** illustration `GenerationSpecification` (from GEN-0) into a validated, grounded, and reproducible `IllustrationGenerationRequest`.

### Architecture Flow
```
Modul Ajar / Sumber Belajar
  │
  ▼
Grounded Context & Outline (GEN-0)
  │
  ▼
Teacher Review & Edits (GEN-0)
  │
  ▼
Style Selection & Approval Gate (GEN-0)
  │
  ▼
Approved GenerationSpecification (GEN-0)
  │
  ▼
[VIS-1A] Approval Re-Validation & Injection Defense
  │
  ▼
[VIS-1A] Canonical Request Builder & Deterministic Prompt Assembler
  │
  ▼
[VIS-1A] Persistence (public.illustration_generation_requests)
  │
  ▼
[VIS-1B - FUTURE GATE] Real AI Image Provider Execution (Imagen 3 / DALL-E)
```

### Strict Non-Goals & Invariants Enforced in VIS-1A
- **Strict Non-Generation Policy**: VIS-1A does **NOT** call external image APIs (e.g. Gemini Imagen, OpenAI DALL-E, Stability AI).
- **No Mock / Fake Returns**: VIS-1A does **NOT** return fake SVGs or static mock PNGs as "generated" images. It strictly stops after preparing and saving the canonical request.
- **Fail-Closed Target Guard**: Rejects presentation plans or specifications attempting to use the illustration generation pipeline.
- **Server-Side Approval Re-Validation**: Must never trust client claims. Checks that `plan.status === 'approved'`, `plan.approvedVersion === plan.currentVersion`, and teacher ownership is verified.

---

## 2. Canonical Contracts & Domain Models

Defined in [`src/lib/ai/illustration-generation-contract.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/illustration-generation-contract.ts):

### 1. Generation Parameters (`IllustrationGenerationParameters`)
- `aspectRatio`: `"1:1" | "16:9" | "4:3" | "3:4" | "9:16"` (default `"1:1"`)
- `width`: integer min 256, max 2048 (default 1024)
- `height`: integer min 256, max 2048 (default 1024)
- `quality`: `"standard" | "hd"` (default `"standard"`)
- `numberOfImages`: integer min 1, max 4 (default 1)
- `seed`: optional integer for reproducibility
- `providerExtension`: `Record<string, any>` for provider-specific extras (e.g. guidance scale)

### 2. Text-in-Image Policy (`IllustrationTextPolicy`)
- `mustAppear`: string[] (exact label terms specified in the outline)
- `mayAppear`: string[] (optional pedagogical text elements)
- `mustNotAppear`: string[] (prohibited text, watermarks, signatures)
- `allowModelInventedText`: `false` (strictly literal `false`, preventing the image model from hallucinating illegible text)
- `textRenderStrategy`: `"clean_visual_only" | "embedded_labels" | "post_process_overlay"`

### 3. Assembled Prompt Structure (`AssembledIllustrationPrompt`)
- `systemPrompt`: Educational illustrator role with Indonesian National Curriculum (Kurikulum Merdeka) context and safety directives.
- `styleDirectives`: Style-specific visual rules, layout guidelines, and prompt modifiers.
- `subjectDescription`: Sanitized main educational subject, supporting elements, educational focus, pose/action, and background.
- `compositionDirectives`: Composition layout, perspective angle, and instructional visual contrast.
- `negativePrompt`: Deduplicated combination of outline things-to-avoid, style things-to-avoid, and standard quality safeguards (no watermarks, distorted anatomy, hallucinated text).
- `fullPrompt`: Deterministic single-string concatenation for unified text-to-image models.

### 4. Canonical Illustration Generation Request (`IllustrationGenerationRequest`)
```ts
export interface IllustrationGenerationRequest {
  requestId: string;                      // req_ill_<id>
  generationPlanId: string;               // Reference to public.generation_plans(id)
  moduleId: string;                       // Reference to modul
  targetType: "illustration";             // Strict target enforcement
  approvedOutlineVersion: number;         // Must match plan.approvedVersion
  approvedOutline: IllustrationOutline;   // Full structural outline snapshot
  styleId: string;                        // Validated catalog style ID
  styleVersion: number;                   // Style definition version
  styleDefinition: GenerationStyle;       // Complete style snapshot
  sourceReferences: string[];             // Grounded source references
  evidenceReferences: string[];           // Evidence chunk IDs
  generationParameters: IllustrationGenerationParameters;
  assembledPrompt: AssembledIllustrationPrompt;
  textPolicy: IllustrationTextPolicy;
  createdAt: string;                      // ISO timestamp
}
```

### 5. Normalized Generation Result Contract (`IllustrationGenerationResult`)
Prepared for VIS-1B execution:
- `generationId`: Unique ID
- `requestId`: Matching request ID
- `status`: `"pending" | "processing" | "succeeded" | "failed"`
- `assetReference`?: Storage URL / key
- `mimeType`?: e.g. `image/webp`
- `width`?: number
- `height`?: number
- `provider`?: Provider identifier
- `model`?: Model name (e.g. `imagen-3.0-generate-002`)
- `providerRequestId`?: Provider transaction ID
- `error`?: `{ code: string; message: string; isRetryable?: boolean }`

### 6. Provider Adapter Boundary Interface (`IllustrationGenerationProvider`)
```ts
export interface IllustrationGenerationProvider {
  readonly providerName: string;
  validateRequest(request: IllustrationGenerationRequest): Promise<{ valid: boolean; reason?: string }>;
  generate(request: IllustrationGenerationRequest): Promise<IllustrationGenerationResult>;
  normalizeResult(rawOutput: unknown, request: IllustrationGenerationRequest): IllustrationGenerationResult;
}
```

---

## 3. Deterministic Request Builder & Injection Defense

Implemented in [`src/lib/ai/illustration-request-builder.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/illustration-request-builder.ts):

### Sanitization & Prompt Injection Protection
- `sanitizePromptText`: Strips instruction hijacking phrases (e.g., `ignore previous instructions`, `SYSTEM:`, `ASSISTANT:`, `[INST]`), script tags (`<script>`), and raw HTML tags.
- Treats user text as visual data to ensure downstream models cannot be prompted to bypass safety controls.

### Pure Function Implementation
- `buildIllustrationGenerationRequest`:
  - Re-evaluates `validateGenerationPlanApprovalEligibility(plan, authContext)`.
  - Enforces `plan.status === 'approved'` and `plan.approvedVersion === plan.currentVersion`.
  - Verifies style existence in the illustration catalog.
  - Merges and validates parameters.
  - Assembles prompt deterministically.
  - Produces immutable request payload.

---

## 4. Database Schema & Multi-Tenant Security

Migration: [`supabase/migrations/20260929120000_illustration_generation_requests.sql`](file:///c:/novara%20project/gurupro-ai-journal-main/supabase/migrations/20260929120000_illustration_generation_requests.sql)

### Table: `public.illustration_generation_requests`
| Column | Type | Description |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | Canonical Request ID (`req_ill_...`) |
| `generation_plan_id` | `TEXT NOT NULL` | FK to `public.generation_plans(id)` |
| `approved_version` | `INTEGER NOT NULL` | Plan version that was approved |
| `style_id` | `TEXT NOT NULL` | FK to `public.generation_styles(id)` |
| `style_version` | `INTEGER NOT NULL` | Style version used |
| `request_snapshot` | `JSONB NOT NULL` | Full validated `IllustrationGenerationRequest` |
| `status` | `TEXT NOT NULL` | `'prepared' \| 'submitted' \| 'processing' \| 'succeeded' \| 'failed' \| 'cancelled'` |
| `created_by` | `UUID NOT NULL` | FK to `auth.users(id)` |
| `created_at` | `TIMESTAMPTZ` | Timestamp of creation |
| `updated_at` | `TIMESTAMPTZ` | Timestamp of last update |

### RLS Policies
- `SELECT`, `INSERT`, `UPDATE` restricted to authenticated users where:
  `created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'guru')`

---

## 5. Server Functions & Client Store Integration

### TanStack Start Server Functions
In [`src/lib/illustration-generation.functions.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/illustration-generation.functions.ts):
- `prepareIllustrationGenerationRequestServerFn`: Validates teacher authentication, ownership, re-validates approval status, builds request, persists snapshot, and returns the canonical request.
- `getIllustrationGenerationRequestServerFn`: Securely fetches prepared request by ID for the owning teacher.

### Client Store & UI Panel
- In [`src/lib/generation-planning-store.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/generation-planning-store.ts): `prepareIllustrationRequest` action and `preparedRequest` state.
- In [`src/components/generation-planning-panel.tsx`](file:///c:/novara%20project/gurupro-ai-journal-main/src/components/generation-planning-panel.tsx):
  - Step 5 features button: `[Siapkan Permintaan Generasi (VIS-1A)]`.
  - Displays inspection details (Request ID, Aspect Ratio/Resolution, Text Policy, Assembled Prompt).
  - Keeps "Generate Gambar Nyata" strictly disabled with `VIS-1B Segera Hadir`.

---

## 6. Verification & Test Suite Summary

Dedicated Suite: [`tests/ai/illustration-generation-contract.test.mjs`](file:///c:/novara%20project/gurupro-ai-journal-main/tests/ai/illustration-generation-contract.test.mjs)
- **32 Scenarios Executed**:
  1. Default parameters (1024x1024, 1:1, standard, 1 image)
  2. Custom parameters (16:9, HD, seed, multi-image)
  3. Rejection of undersized (< 256px) and oversized (> 2048px) dimensions
  4. Rejection of unsupported aspect ratios and image counts
  5. Preservation of provider extensions
  6. Strict prohibition of model invented text (`allowModelInventedText: false`)
  7. Automated text rendering strategies (`clean_visual_only` vs `embedded_labels`)
  8. Prompt injection sanitization and tag stripping
  9. Deterministic prompt assembly output
  10. Indonesian National Curriculum context incorporation
  11. Negative prompt deduplication with standard safeguards
  12. Valid canonical request generation
  13. Target type guard rejection of presentation targets
  14. Approval gate rejection of unapproved / draft plans
  15. Stale approval rejection upon outline edits
  16. Outline version mismatch rejection
  17. Style mismatch and missing style rejection
  18. Non-owner teacher RBAC rejection
  19. Non-teacher role RBAC rejection
  20. Multi-tenant isolation verification
  21. Grounding and provenance preservation
  22. Result schema validation for succeeded & failed results
  23. Mock provider boundary verification
  24. Zero external API calls / cost-control invariant (< 50ms in-memory execution)
  25. Request persistence and tenant-isolated retrieval
