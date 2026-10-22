/** Privacy and cost bounds on what leaves the machine (§15.2). */
export interface AiLimits {
  /** Largest binary source (image) sent to the model, in bytes. */
  maxBlobBytes: number;
  /** Longest text source sent to the model, in characters; longer text is truncated with a warning. */
  maxTextChars: number;
  /** Most reference images sent in one request. */
  maxImages: number;
}

export const DEFAULT_AI_LIMITS: AiLimits = {
  maxBlobBytes: 5 * 1024 * 1024,
  maxTextChars: 200_000,
  maxImages: 8,
};
