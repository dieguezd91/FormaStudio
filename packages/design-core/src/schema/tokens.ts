import { z } from 'zod';

export const tokenRefSchema = z.strictObject({ token: z.string().min(1) });
export type TokenRef = z.infer<typeof tokenRefSchema>;

/** A style value is either a literal or a reference such as `{ token: 'colors.primary' }`. */
export const styleValue = <T extends z.ZodType>(literal: T) => z.union([literal, tokenRefSchema]);

export const TOKEN_GROUPS = ['colors', 'fontSizes', 'spacing', 'radii'] as const;
export const tokenGroupSchema = z.enum(TOKEN_GROUPS);
export type TokenGroup = z.infer<typeof tokenGroupSchema>;

export const styleTokensSchema = z.strictObject({
  colors: z.record(z.string(), z.string()),
  fontSizes: z.record(z.string(), z.number()),
  spacing: z.record(z.string(), z.number()),
  radii: z.record(z.string(), z.number()),
});
export type StyleTokens = z.infer<typeof styleTokensSchema>;

export const tokenValueSchema = z.union([z.string(), z.number()]);
export type TokenValue = z.infer<typeof tokenValueSchema>;
