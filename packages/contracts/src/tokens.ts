import { z } from "zod";

export const LIMITS = Object.freeze({
  sourceBytes: 1_048_576,
  nodes: 5_000,
  depth: 24,
  textLength: 50_000,
  assets: 200,
  batchSize: 50,
});

export const spacingTokens = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;
export const radiusTokens = {
  none: 0,
  sm: 4,
  md: 12,
  lg: 24,
  pill: 9999,
} as const;
export const fontSizeTokens = {
  sm: 14,
  md: 18,
  lg: 24,
  xl: 32,
  title: 48,
} as const;
export const colorSchema = z
  .string()
  .regex(
    /^(?:#[\da-fA-F]{3}|#[\da-fA-F]{6}|\$(?:primary|text|surface|muted))$/,
    "颜色必须为 #RGB、#RRGGBB 或已注册颜色 Token",
  );
const spacing = z.enum(["none", "xs", "sm", "md", "lg", "xl"]);
export const controlledStyleSchema = z
  .object({
    color: colorSchema.optional(),
    background: colorSchema.optional(),
    fontSize: z
      .union([
        z.enum(["sm", "md", "lg", "xl", "title"]),
        z.number().int().min(12).max(72),
      ])
      .optional(),
    fontWeight: z
      .union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)])
      .optional(),
    padding: spacing.optional(),
    paddingX: spacing.optional(),
    paddingY: spacing.optional(),
    margin: spacing.optional(),
    marginTop: spacing.optional(),
    marginBottom: spacing.optional(),
    gap: spacing.optional(),
    radius: z.enum(["none", "sm", "md", "lg", "pill"]).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
  })
  .strict();

export type ControlledStyle = z.infer<typeof controlledStyleSchema>;
export type ColorValue = z.infer<typeof colorSchema>;
