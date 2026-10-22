/** A non-fatal remark shown to the user next to an AI result; `message` is Spanish. */
export interface AiWarning {
  code: string;
  message: string;
  sourceId?: string;
  requirementId?: string;
  proposalId?: string;
}

export const warning = (
  code: string,
  message: string,
  refs: Omit<AiWarning, 'code' | 'message'> = {},
): AiWarning => ({ code, message, ...refs });
