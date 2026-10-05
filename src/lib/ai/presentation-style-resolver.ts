/**
 * ==============================================================================
 * GURUPRO AI: PRESENTATION STYLE RESOLVER (PPT-1C)
 * ==============================================================================
 *
 * Maps approved presentation styles from the canonical style catalog
 * into concrete design tokens for PowerPoint (pptxgenjs) rendering:
 * - Theme colors (primary, secondary, text, background, cards, borders)
 * - Typography (title, body, code fonts, font sizes)
 * - Slide spacing and margins (in inches)
 * - Container and shape visual rules
 */

import { PRESENTATION_STYLES_CATALOG } from "./generation-planning-contract";

export interface ResolvedPresentationTheme {
  styleId: string;
  styleName: string;
  version: number;
  colors: {
    background: string;
    cardBackground: string;
    cardBackgroundAlt: string;
    primary: string;
    secondary: string;
    accent: string;
    textPrimary: string;
    textSecondary: string;
    border: string;
    codeBackground: string;
    codeText: string;
    footerText: string;
    badgeBackground: string;
    badgeText: string;
  };
  typography: {
    titleFont: string;
    bodyFont: string;
    codeFont: string;
    titleFontSize: number;
    subtitleFontSize: number;
    headingFontSize: number;
    bodyFontSize: number;
    bulletFontSize: number;
    captionFontSize: number;
    statNumberFontSize: number;
  };
  spacing: {
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    titleBottomGap: number;
    blockGap: number;
  };
  decorations: {
    headerDivider: boolean;
    roundedCards: boolean;
    subtleShadow: boolean;
  };
}

/**
 * Verified Style Theme Map for all 6 presentation presets.
 */
const STYLE_THEME_REGISTRY: Record<string, ResolvedPresentationTheme> = {
  style_ppt_modern_minimal: {
    styleId: "style_ppt_modern_minimal",
    styleName: "Modern Minimal",
    version: 1,
    colors: {
      background: "FFFFFF",
      cardBackground: "F8FAFC",
      cardBackgroundAlt: "F1F5F9",
      primary: "0F172A", // Dark Slate
      secondary: "475569",
      accent: "2563EB", // Royal Blue
      textPrimary: "0F172A",
      textSecondary: "64748B",
      border: "E2E8F0",
      codeBackground: "1E293B",
      codeText: "F8FAFC",
      footerText: "94A3B8",
      badgeBackground: "F1F5F9",
      badgeText: "334155",
    },
    typography: {
      titleFont: "Arial",
      bodyFont: "Calibri",
      codeFont: "Courier New",
      titleFontSize: 28,
      subtitleFontSize: 14,
      headingFontSize: 16,
      bodyFontSize: 13,
      bulletFontSize: 12,
      captionFontSize: 10,
      statNumberFontSize: 40,
    },
    spacing: {
      marginTop: 0.6,
      marginBottom: 0.5,
      marginLeft: 0.8,
      marginRight: 0.8,
      titleBottomGap: 0.35,
      blockGap: 0.2,
    },
    decorations: {
      headerDivider: true,
      roundedCards: true,
      subtleShadow: false,
    },
  },

  style_ppt_edu_classroom: {
    styleId: "style_ppt_edu_classroom",
    styleName: "Educational Classroom",
    version: 1,
    colors: {
      background: "FAFAF9", // Warm Stone
      cardBackground: "FFFFFF",
      cardBackgroundAlt: "F0FDF4", // Mint Tint
      primary: "1E3A8A", // Indigo Navy (High Projector Contrast)
      secondary: "059669", // Emerald Green
      accent: "D97706", // Amber
      textPrimary: "1E293B",
      textSecondary: "475569",
      border: "CBD5E1",
      codeBackground: "0F172A",
      codeText: "E2E8F0",
      footerText: "64748B",
      badgeBackground: "DBEAFE",
      badgeText: "1E40AF",
    },
    typography: {
      titleFont: "Trebuchet MS",
      bodyFont: "Calibri",
      codeFont: "Courier New",
      titleFontSize: 26,
      subtitleFontSize: 13,
      headingFontSize: 15,
      bodyFontSize: 13,
      bulletFontSize: 12,
      captionFontSize: 10,
      statNumberFontSize: 38,
    },
    spacing: {
      marginTop: 0.5,
      marginBottom: 0.5,
      marginLeft: 0.7,
      marginRight: 0.7,
      titleBottomGap: 0.3,
      blockGap: 0.18,
    },
    decorations: {
      headerDivider: true,
      roundedCards: true,
      subtleShadow: true,
    },
  },

  style_ppt_corp_pro: {
    styleId: "style_ppt_corp_pro",
    styleName: "Corporate Professional",
    version: 1,
    colors: {
      background: "FFFFFF",
      cardBackground: "F8FAFC",
      cardBackgroundAlt: "EFF6FF",
      primary: "0B2545", // Deep Navy
      secondary: "134074",
      accent: "0284C7", // Sky Blue
      textPrimary: "0F172A",
      textSecondary: "475569",
      border: "CBD5E1",
      codeBackground: "0B132B",
      codeText: "E0E1DD",
      footerText: "94A3B8",
      badgeBackground: "E0E7FF",
      badgeText: "3730A3",
    },
    typography: {
      titleFont: "Segoe UI",
      bodyFont: "Segoe UI",
      codeFont: "Consolas",
      titleFontSize: 26,
      subtitleFontSize: 13,
      headingFontSize: 15,
      bodyFontSize: 12.5,
      bulletFontSize: 12,
      captionFontSize: 9.5,
      statNumberFontSize: 36,
    },
    spacing: {
      marginTop: 0.55,
      marginBottom: 0.5,
      marginLeft: 0.75,
      marginRight: 0.75,
      titleBottomGap: 0.3,
      blockGap: 0.2,
    },
    decorations: {
      headerDivider: true,
      roundedCards: false,
      subtleShadow: false,
    },
  },

  style_ppt_visual_learning: {
    styleId: "style_ppt_visual_learning",
    styleName: "Visual Learning",
    version: 1,
    colors: {
      background: "FFFFFF",
      cardBackground: "F8FAFC",
      cardBackgroundAlt: "FEF3C7",
      primary: "4338CA", // Violet Indigo
      secondary: "0284C7",
      accent: "EA580C", // Orange
      textPrimary: "1E1B4B",
      textSecondary: "475569",
      border: "E0E7FF",
      codeBackground: "1E1B4B",
      codeText: "F8FAFC",
      footerText: "818CF8",
      badgeBackground: "EEF2FF",
      badgeText: "4338CA",
    },
    typography: {
      titleFont: "Arial",
      bodyFont: "Calibri",
      codeFont: "Courier New",
      titleFontSize: 26,
      subtitleFontSize: 13,
      headingFontSize: 15,
      bodyFontSize: 12.5,
      bulletFontSize: 12,
      captionFontSize: 9.5,
      statNumberFontSize: 40,
    },
    spacing: {
      marginTop: 0.5,
      marginBottom: 0.5,
      marginLeft: 0.7,
      marginRight: 0.7,
      titleBottomGap: 0.3,
      blockGap: 0.2,
    },
    decorations: {
      headerDivider: true,
      roundedCards: true,
      subtleShadow: true,
    },
  },

  style_ppt_technical: {
    styleId: "style_ppt_technical",
    styleName: "Technical",
    version: 1,
    colors: {
      background: "F8FAFC",
      cardBackground: "FFFFFF",
      cardBackgroundAlt: "0F172A",
      primary: "0F172A", // Slate Dark
      secondary: "0D9488", // Teal
      accent: "2563EB", // Blue
      textPrimary: "0F172A",
      textSecondary: "334155",
      border: "CBD5E1",
      codeBackground: "0F172A",
      codeText: "38BDF8", // Cyan text
      footerText: "64748B",
      badgeBackground: "CCFBF1",
      badgeText: "115E59",
    },
    typography: {
      titleFont: "Consolas",
      bodyFont: "Calibri",
      codeFont: "Consolas",
      titleFontSize: 24,
      subtitleFontSize: 12,
      headingFontSize: 14,
      bodyFontSize: 12,
      bulletFontSize: 11.5,
      captionFontSize: 9.5,
      statNumberFontSize: 36,
    },
    spacing: {
      marginTop: 0.5,
      marginBottom: 0.5,
      marginLeft: 0.65,
      marginRight: 0.65,
      titleBottomGap: 0.25,
      blockGap: 0.16,
    },
    decorations: {
      headerDivider: true,
      roundedCards: false,
      subtleShadow: false,
    },
  },

  style_ppt_academic: {
    styleId: "style_ppt_academic",
    styleName: "Academic",
    version: 1,
    colors: {
      background: "FCFCFA", // Scholarly Cream
      cardBackground: "FFFFFF",
      cardBackgroundAlt: "F5F5F0",
      primary: "1E293B", // Deep Charcoal
      secondary: "78350F", // Amber Brown
      accent: "1E40AF", // Blue
      textPrimary: "1C1917",
      textSecondary: "44403C",
      border: "D6D3D1",
      codeBackground: "1C1917",
      codeText: "F5F5F4",
      footerText: "78716C",
      badgeBackground: "FEF3C7",
      badgeText: "92400E",
    },
    typography: {
      titleFont: "Georgia",
      bodyFont: "Calibri",
      codeFont: "Courier New",
      titleFontSize: 25,
      subtitleFontSize: 13,
      headingFontSize: 14.5,
      bodyFontSize: 12.5,
      bulletFontSize: 11.5,
      captionFontSize: 9.5,
      statNumberFontSize: 36,
    },
    spacing: {
      marginTop: 0.6,
      marginBottom: 0.5,
      marginLeft: 0.8,
      marginRight: 0.8,
      titleBottomGap: 0.3,
      blockGap: 0.18,
    },
    decorations: {
      headerDivider: true,
      roundedCards: false,
      subtleShadow: false,
    },
  },
};

/**
 * Resolves a presentation style ID into a concrete Theme.
 * Falls back to 'style_ppt_edu_classroom' if styleId is unrecognized.
 */
export function resolvePresentationTheme(styleId: string): ResolvedPresentationTheme {
  const theme = STYLE_THEME_REGISTRY[styleId];
  if (theme) {
    return theme;
  }

  // Fallback to verified classroom style
  return STYLE_THEME_REGISTRY.style_ppt_edu_classroom;
}

/**
 * Lists all verified presentation themes available in PPT-1C.
 */
export function listPresentationThemes(): ResolvedPresentationTheme[] {
  return Object.values(STYLE_THEME_REGISTRY);
}
