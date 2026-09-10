/**
 * Read and extend the prompt text of a Gemini request payload, without
 * mutating the caller's object.
 *
 * Split out of App.tsx so it can be tested: the rule-1.5 guard appends to
 * every outgoing payload (see the `fetchWithRetries` wrapper), so a mistake
 * here — mutating the caller's payload, dropping a part, appending to the
 * wrong one — would corrupt every AI call in the game rather than just one.
 */

export interface PromptPart {
  text?: string;
  [key: string]: unknown;
}

export interface PromptContent {
  role?: string;
  parts?: PromptPart[];
  [key: string]: unknown;
}

export interface PromptPayload {
  contents?: PromptContent[];
  [key: string]: unknown;
}

/** All prompt text in the first content block, joined — for substring checks. */
export function promptTextOf(payload: PromptPayload | null | undefined): string {
  const parts = payload?.contents?.[0]?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('\n');
}

/**
 * A copy of `payload` with `extra` appended (on its own line) to the LAST text
 * part of the first content block.
 *
 * The last part, not the first: a prompt's final lines are its output
 * instructions ("CHỈ TRẢ VỀ JSON..."), and a constraint has to sit with them
 * to be obeyed — appending to part 0 of a multi-part prompt would bury it.
 *
 * Returns the payload untouched when there is nothing sane to append to, so a
 * caller with an unexpected shape degrades to "no rule added" instead of
 * throwing mid-request.
 */
export function appendToPromptText(
  payload: PromptPayload | null | undefined,
  extra: string,
): PromptPayload | null | undefined {
  const parts = payload?.contents?.[0]?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return payload;
  const lastIdx = parts.length - 1;
  if (typeof parts[lastIdx]?.text !== 'string') return payload;
  return {
    ...payload,
    contents: [
      {
        ...payload!.contents![0],
        parts: parts.map((p, i) => (i === lastIdx ? { ...p, text: `${p.text}\n${extra}` } : p)),
      },
      ...payload!.contents!.slice(1),
    ],
  };
}
