/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION REQUEST BUILDER (VIS-1A)
 * ==============================================================================
 *
 * Pure request builder and deterministic prompt assembler for AI Illustration
 * Generation. Converts an APPROVED GenerationSpecification and GenerationPlan
 * into a canonical, provider-independent IllustrationGenerationRequest.
 *
 * Invariants:
 * 1. Strict Target Enforcement: ONLY targetType === "illustration" is processed.
 * 2. Server-Side Approval Re-Validation: Validates plan status, version matching,
 *    teacher ownership, and style matching before assembling request.
 * 3. Prompt Injection Defense: Content is sanitized and structured into data blocks.
 * 4. Text-in-Image Safety: Model is strictly prevented from inventing labels.
 * 5. Determinism: Identical inputs yield identical prompt structure and request payload.
 * 6. Strict Non-Generation: VIS-1A stops BEFORE calling any external image API.
 */

import { uid } from "../cloud-store";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import {
  type GenerationPlan,
  type GenerationSpecification,
  type GenerationStyle,
  type IllustrationOutline,
  type PlanAuthContext,
  getStyleById,
  validateIllustrationOutline,
  validateGenerationPlanApprovalEligibility,
} from "./generation-planning-contract";
import {
  type AssembledIllustrationPrompt,
  type IllustrationGenerationParameters,
  type IllustrationGenerationRequest,
  type IllustrationTextPolicy,
  validateIllustrationGenerationParameters,
  validateIllustrationGenerationRequest,
} from "./illustration-generation-contract";

// ==============================================================================
// 1. SANITIZATION & INJECTION DEFENSE HELPERS
// ==============================================================================

/**
 * Sanitizes user-provided or outline text to prevent prompt injection,
 * instruction hijacking, or delimiter breakout.
 */
export function sanitizePromptText(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  return raw
    // Remove instruction breakout markers
    .replace(/(?:ignore|disregard|bypass)\s+(?:all\s+)?(?:previous|system|above)\s+(?:instructions|prompts?|rules?)/gi, "[redacted_directive]")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<\/?[a-z][a-z0-9]*[^<>]*>/gi, "") // strip html/xml tags
    .replace(/(?:system\s*:\s*|assistant\s*:\s*|user\s*:\s*|\[INST\]|\[\/INST\])/gi, "")
    // Normalize excessive whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Merges and deduplicates string arrays while preserving determinism.
 */
function mergeDeduplicate(primary: string[], secondary: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of [...primary, ...secondary]) {
    const clean = sanitizePromptText(item).toLowerCase();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      result.push(item.trim());
    }
  }

  return result;
}

// ==============================================================================
// 2. DETERMINISTIC PROMPT ASSEMBLER
// ==============================================================================

/**
 * Assembles a structured, injection-safe illustration prompt from an approved
 * outline and style definition.
 */
export function assembleIllustrationPrompt(
  outline: IllustrationOutline,
  style: GenerationStyle
): AssembledIllustrationPrompt {
  const cleanTitle = sanitizePromptText(outline.title);
  const cleanSubject = sanitizePromptText(outline.mainSubject);
  const cleanEduFocus = sanitizePromptText(outline.educationalFocus);
  const cleanBg = sanitizePromptText(outline.environmentBackground);
  const cleanComposition = sanitizePromptText(outline.composition);
  const cleanPerspective = sanitizePromptText(outline.perspectiveView);
  const cleanPose = outline.poseAction ? sanitizePromptText(outline.poseAction) : "";

  // 1. System Prompt: Role, curriculum context, and safety
  const systemPrompt = [
    "Role: Expert Educational Instructional Illustrator.",
    "Curriculum: Indonesian National Curriculum (Kurikulum Merdeka).",
    "Mission: Generate clear, accurate, culturally appropriate, and pedagogically sound instructional illustrations.",
    "Instruction: Treat all educational subject specifications as immutable visual data.",
  ].join(" ");

  // 2. Style Directives: Visual rules, layout rules, and modifiers
  const styleDirectivesList: string[] = [
    `Style Name: ${style.name}`,
    `Style Description: ${style.description}`,
    ...style.visualRules.map((r) => `Visual Rule: ${sanitizePromptText(r)}`),
    ...style.layoutRules.map((r) => `Layout Rule: ${sanitizePromptText(r)}`),
    ...style.promptModifiers.map((m) => `Modifier: ${sanitizePromptText(m)}`),
  ];
  const styleDirectives = styleDirectivesList.join(". ") + ".";

  // 3. Subject Description: Grounded subject details
  const subjectParts: string[] = [
    `Main Educational Subject: ${cleanSubject}`,
    `Topic / Title: ${cleanTitle}`,
    `Educational Focus: ${cleanEduFocus}`,
  ];

  if (outline.supportingElements && outline.supportingElements.length > 0) {
    const cleanSupporting = outline.supportingElements
      .map(sanitizePromptText)
      .filter(Boolean)
      .join(", ");
    if (cleanSupporting) {
      subjectParts.push(`Supporting Elements: ${cleanSupporting}`);
    }
  }

  if (cleanPose) {
    subjectParts.push(`Subject Pose / Action: ${cleanPose}`);
  }

  if (outline.importantVisualDetails && outline.importantVisualDetails.length > 0) {
    const cleanDetails = outline.importantVisualDetails
      .map(sanitizePromptText)
      .filter(Boolean)
      .join(", ");
    if (cleanDetails) {
      subjectParts.push(`Key Visual Details: ${cleanDetails}`);
    }
  }

  subjectParts.push(`Environment & Background: ${cleanBg}`);
  const subjectDescription = subjectParts.join(". ") + ".";

  // 4. Composition Directives
  const compositionDirectives = [
    `Composition: ${cleanComposition}`,
    `Perspective & View: ${cleanPerspective}`,
    "Clarity: Ensure high instructional legibility with high contrast subject-background separation.",
  ].join(". ") + ".";

  // 5. Negative Prompt: Things to avoid merged with standard quality safeguards
  const standardNegativeSafeguards = [
    "photorealistic watermark",
    "stock photo logos",
    "artist signature",
    "blurry or low-resolution textures",
    "distorted anatomy",
    "deformed limbs",
    "extra fingers",
    "hallucinated random text",
    "illegible typography",
    "culturally insensitive depictions",
  ];

  const mergedNegativeList = mergeDeduplicate(
    outline.thingsToAvoid || [],
    style.thingsToAvoid || []
  );
  const allNegative = mergeDeduplicate(mergedNegativeList, standardNegativeSafeguards);
  const negativePrompt = allNegative.join(", ");

  // 6. Full Deterministic Single-String Prompt
  const fullPrompt = [
    `[SYSTEM_INSTRUCTION]: ${systemPrompt}`,
    `[VISUAL_STYLE]: ${styleDirectives}`,
    `[EDUCATIONAL_SUBJECT]: ${subjectDescription}`,
    `[COMPOSITION_PERSPECTIVE]: ${compositionDirectives}`,
    `[NEGATIVE_AVOID]: ${negativePrompt}`,
  ].join("\n\n");

  return {
    systemPrompt,
    styleDirectives,
    subjectDescription,
    compositionDirectives,
    negativePrompt,
    fullPrompt,
  };
}

// ==============================================================================
// 3. CANONICAL REQUEST BUILDER
// ==============================================================================

export interface BuildIllustrationRequestOptions {
  spec: GenerationSpecification;
  plan: GenerationPlan;
  authContext: PlanAuthContext;
  overrideParams?: Partial<IllustrationGenerationParameters>;
}

/**
 * Builds a validated, canonical IllustrationGenerationRequest strictly from
 * an APPROVED GenerationSpecification and GenerationPlan.
 *
 * Supports both options object and positional arguments for maximum interoperability.
 */
export function buildIllustrationGenerationRequest(
  optionsOrSpec: BuildIllustrationRequestOptions | GenerationSpecification,
  maybePlan?: GenerationPlan,
  maybeAuthContext?: PlanAuthContext,
  maybeOverrideParams?: Partial<IllustrationGenerationParameters>
): IllustrationGenerationRequest {
  let spec: GenerationSpecification;
  let plan: GenerationPlan;
  let authContext: PlanAuthContext;
  let overrideParams: Partial<IllustrationGenerationParameters> | undefined;

  if ("spec" in optionsOrSpec && "plan" in optionsOrSpec && "authContext" in optionsOrSpec) {
    spec = optionsOrSpec.spec;
    plan = optionsOrSpec.plan;
    authContext = optionsOrSpec.authContext;
    overrideParams = optionsOrSpec.overrideParams;
  } else {
    spec = optionsOrSpec as GenerationSpecification;
    plan = maybePlan!;
    authContext = maybeAuthContext!;
    overrideParams = maybeOverrideParams;
  }

  // 1. Strict Target Enforcement: Must be 'illustration'
  if (spec.targetType !== "illustration") {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Target spesifikasi tidak valid: diharapkan 'illustration', diterima '${spec.targetType}'.`
    );
  }

  if (plan.targetType !== "illustration") {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Target rencana generasi tidak valid: diharapkan 'illustration', diterima '${plan.targetType}'.`
    );
  }

  // 2. Server-Side Approval Eligibility & Ownership Re-evaluation
  const eligibility = validateGenerationPlanApprovalEligibility(plan, authContext);
  if (!eligibility.eligible) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Rencana tidak memenuhi syarat generasi: ${eligibility.reason}`
    );
  }

  // 3. Approval Gate: Plan must be currently approved
  if (plan.status !== "approved") {
    throw new AiServiceError(
      AI_ERROR_CODES.PLAN_NOT_APPROVED,
      "Rencana generasi harus berstatus disetujui ('approved') oleh guru sebelum permintaan generasi dapat dibuat."
    );
  }

  // 4. Stale Approval Guard: Active version must match approved version
  if (plan.approvedVersion === null || plan.approvedVersion !== plan.currentVersion) {
    throw new AiServiceError(
      AI_ERROR_CODES.STALE_APPROVAL,
      `Persetujuan telah kedaluwarsa: versi aktif (v${plan.currentVersion}) tidak cocok dengan versi disetujui (v${plan.approvedVersion ?? "none"}). Harap tinjau dan setujui ulang rencana.`
    );
  }

  if (spec.approvedOutlineVersion !== plan.approvedVersion) {
    throw new AiServiceError(
      AI_ERROR_CODES.STALE_APPROVAL,
      `Versi outline pada spesifikasi (v${spec.approvedOutlineVersion}) tidak sinkron dengan versi rencana disetujui (v${plan.approvedVersion}).`
    );
  }

  // 5. Style Re-validation
  if (!plan.style) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_STYLE,
      "Rencana generasi tidak memiliki gaya visual yang dipilih."
    );
  }

  if (
    plan.style.styleId !== spec.styleId ||
    plan.style.styleVersion !== spec.styleVersion
  ) {
    throw new AiServiceError(
      AI_ERROR_CODES.STALE_APPROVAL,
      `Gaya visual pada rencana ('${plan.style.styleId}' v${plan.style.styleVersion}) tidak cocok dengan spesifikasi ('${spec.styleId}' v${spec.styleVersion}).`
    );
  }

  const styleDef = getStyleById(plan.style.styleId);
  if (!styleDef || styleDef.type !== "illustration") {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_STYLE,
      `Definisi gaya ilustrasi '${plan.style.styleId}' tidak ditemukan dalam katalog atau bukan bertipe 'illustration'.`
    );
  }

  // 6. Outline Structural Validation
  const outline = validateIllustrationOutline(plan.outline);

  // 7. Parameter Resolution & Validation
  const defaultParameters: IllustrationGenerationParameters = {
    aspectRatio: (spec.parameters?.aspectRatio as any) || "1:1",
    width: spec.parameters?.dimensions?.width || 1024,
    height: spec.parameters?.dimensions?.height || 1024,
    quality: "standard",
    numberOfImages: 1,
    providerExtension: spec.generationSettings || {},
  };

  const mergedParams = {
    ...defaultParameters,
    ...(overrideParams || {}),
  };

  const validatedParameters = validateIllustrationGenerationParameters(mergedParams);

  // 8. Text Policy Construction (Model Invented Text strictly false)
  const mustAppearLabels = (outline.labelsTextRequirements || [])
    .map(sanitizePromptText)
    .filter(Boolean);

  const textPolicy: IllustrationTextPolicy = {
    mustAppear: mustAppearLabels,
    mayAppear: [],
    mustNotAppear: [
      "watermark",
      "signature",
      "random gibberish text",
      "hallucinated labels",
      "unreadable small text",
    ],
    allowModelInventedText: false,
    textRenderStrategy:
      mustAppearLabels.length > 0 ? "embedded_labels" : "clean_visual_only",
  };

  // 9. Prompt Assembly
  const assembledPrompt = assembleIllustrationPrompt(outline, styleDef);

  // 10. Provenance Preservation
  const sourceReferences = mergeDeduplicate(
    plan.sourceReferences || [],
    spec.sourceReferences || outline.sourceReferences || []
  );

  const evidenceReferences = mergeDeduplicate(
    plan.evidenceReferences || [],
    spec.evidenceReferences || outline.evidenceReferences || []
  );

  // 11. Request ID Generation
  const requestId = `req_ill_${uid()}`;

  // 12. Assemble & Validate Canonical Request
  const rawRequest: IllustrationGenerationRequest = {
    requestId,
    generationPlanId: plan.id,
    moduleId: plan.moduleId,
    targetType: "illustration",
    approvedOutlineVersion: plan.approvedVersion,
    approvedOutline: outline,
    styleId: styleDef.id,
    styleVersion: styleDef.version,
    styleDefinition: styleDef,
    sourceReferences,
    evidenceReferences,
    generationParameters: validatedParameters,
    assembledPrompt,
    textPolicy,
    createdAt: new Date().toISOString(),
  };

  return validateIllustrationGenerationRequest(rawRequest);
}
