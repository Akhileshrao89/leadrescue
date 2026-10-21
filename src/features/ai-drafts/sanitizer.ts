/**
 * Sanitizes untrusted lead notes and user-supplied context before forwarding
 * to LLM prompts, mitigating prompt injection, context escaping, and secret exfiltration.
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/gi,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/gi,
  /you\s+are\s+now\s+in\s+developer\s+mode/gi,
  /dan\s+mode/gi,
  /jailbreak/gi,
  /reveal\s+(your\s+|the\s+)?(system\s+prompt|instructions|secret|api\s*key)/gi,
  /print\s+(your\s+)?(system\s+prompt|instructions)/gi,
  /output\s+(the\s+)?(system\s+prompt|raw\s+instructions)/gi,
  /system\s*:\s*override/gi,
  /new\s+system\s+prompt/gi,
];

const XML_DELIMITER_PATTERNS = [
  /<\/?prospect_notes>/gi,
  /<\/?system>/gi,
  /<\/?instructions>/gi,
  /<\/?user_data>/gi,
  /<\/?prompt>/gi,
];

export interface SanitizedNotesResult {
  sanitized: string;
  hasInjectionAttempt: boolean;
  truncated: boolean;
}

/**
 * Sanitizes untrusted text for safe prompt interpolation.
 * 1. Strips markdown code block fences (``` or ~~~).
 * 2. Strips XML/HTML tags matching prompt boundary tags.
 * 3. Replaces active prompt injection directives with sanitized neutralization markers.
 * 4. Bounds maximum character length to 1,000 characters.
 */
export function sanitizeNotesForPrompt(
  notes: string | null | undefined,
  maxLength = 1000,
): SanitizedNotesResult {
  if (!notes) {
    return { sanitized: "", hasInjectionAttempt: false, truncated: false };
  }

  let text = notes;
  let hasInjectionAttempt = false;

  // 1. Check for prompt injection markers
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      hasInjectionAttempt = true;
      text = text.replace(pattern, "[REDACTED_INJECTION_DIRECTIVE]");
    }
  }

  // 2. Neutralize XML boundary delimiter evasion attempts
  for (const pattern of XML_DELIMITER_PATTERNS) {
    if (pattern.test(text)) {
      hasInjectionAttempt = true;
      text = text.replace(pattern, "[STRIPPED_TAG]");
    }
  }

  // 3. Strip code block ticks that could disrupt JSON formatting
  text = text.replace(/```/g, "'''").replace(/~~~/g, "---");

  // 4. Bound length
  const truncated = text.length > maxLength;
  if (truncated) {
    text = text.slice(0, maxLength);
  }

  return {
    sanitized: text.trim(),
    hasInjectionAttempt,
    truncated,
  };
}

/**
 * Encapsulates prospect notes inside strict XML delimiters for system prompt isolation.
 */
export function buildDelimitedNotesBlock(
  notes: string | null | undefined,
): string {
  const { sanitized } = sanitizeNotesForPrompt(notes);
  if (!sanitized) return "<prospect_notes>None provided.</prospect_notes>";
  return `<prospect_notes>\n${sanitized}\n</prospect_notes>`;
}
