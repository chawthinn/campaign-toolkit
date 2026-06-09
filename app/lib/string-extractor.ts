/**
 * Shared string extractor — used by both the web app and the Chrome extension.
 *
 * Two extraction modes:
 *  1. extractStrings()     — all quoted strings (used by web-app formatter)
 *  2. extractCopyStrings() — only human-readable copy, filters out CSS classes,
 *                            HTML attributes, identifiers, URLs (used by extension overlay)
 */

export interface ExtractedString {
  key: string | null;       // dict key if found, e.g. 'File-9'
  value: string;            // raw copy content (no quotes)
  originalQuoted: string;   // full quoted form:  "Your copy here"
  quoteChar: string;        // ' or "
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if `value` looks like human-readable copy rather than a code
 * identifier, CSS class, URL, or HTML attribute value.
 */
function isCopy(value: string): boolean {
  const v = value.trim();
  if (v.length < 4) return false;                        // too short
  if (v.startsWith('http')) return false;               // URL
  if (v.startsWith('data:')) return false;               // data URI
  if (/^\d+(\.\d+)?$/.test(v)) return false;            // pure number
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return false;     // colour hex
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(v)) return false; // css-class-name
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)) return false;       // single identifier
  if (/^[a-z_]+\.[a-z_]+$/.test(v)) return false;      // dotted.path
  // Must have at least one space, emoji, punctuation, or non-ASCII character
  // — signals real language vs code infrastructure
  return /[\s!?.,;:'"''""\-—À-ɏḀ-ỿ☀-➿\uD800-\uDBFF]/.test(v);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract ALL quoted strings (permissive — used by the web app formatter).
 */
export function extractStrings(code: string): ExtractedString[] {
  const items: ExtractedString[] = [];
  const seen = new Set<string>();

  // Pattern A — dict key : "value"
  const dictRe = /(['"])((?:(?!\1)[^\\]|\\.)*)\1\s*:\s*(['"])((?:(?!\3)[^\\]|\\.)*)\3/g;
  let m: RegExpExecArray | null;

  while ((m = dictRe.exec(code)) !== null) {
    const key = m[2];
    const value = m[4];
    const quoteChar = m[3];
    const originalQuoted = `${quoteChar}${value}${quoteChar}`;
    const uid = `${key}::${originalQuoted}`;
    if (!seen.has(uid) && value.trim().length > 0) {
      seen.add(uid);
      items.push({ key, value, originalQuoted, quoteChar });
    }
  }

  // Pattern B — standalone strings (fallback)
  if (items.length === 0) {
    const strRe = /(["'])((?:(?!\1)[^\\]|\\.)+)\1/g;
    while ((m = strRe.exec(code)) !== null) {
      const quoteChar = m[1];
      const value = m[2];
      const originalQuoted = `${quoteChar}${value}${quoteChar}`;
      if (
        !seen.has(originalQuoted) &&
        value.trim().length > 3 &&
        !value.startsWith('%') &&
        !value.startsWith('{') &&
        !value.startsWith('<')
      ) {
        seen.add(originalQuoted);
        items.push({ key: null, value, originalQuoted, quoteChar });
      }
    }
  }

  return items;
}

/**
 * Extract only human-readable COPY strings — the ones a copywriter
 * would actually edit.  Filters out CSS classes, HTML attributes,
 * identifiers, URLs, and structural code strings.
 *
 * Used by the Chrome extension inline overlay.
 */
export function extractCopyStrings(code: string): ExtractedString[] {
  const items: ExtractedString[] = [];
  const seen = new Set<string>();

  // ── Priority 1: Values in localisation / subject-line dicts ────────────────
  // Pattern: 'key' : "copy string"
  // These are ALWAYS copy regardless of isCopy() heuristic.
  const dictRe = /(['"])((?:(?!\1)[^\\]|\\.)*)\1\s*:\s*(['"])((?:(?!\3)[^\\]|\\.)*)\3/g;
  let m: RegExpExecArray | null;

  while ((m = dictRe.exec(code)) !== null) {
    const key = m[2];
    const value = m[4];
    const quoteChar = m[3];
    const originalQuoted = `${quoteChar}${value}${quoteChar}`;
    const uid = `${key}::${originalQuoted}`;
    // Accept dict values regardless of heuristic — context says they're copy
    if (!seen.has(uid) && value.trim().length > 0) {
      seen.add(uid);
      items.push({ key, value, originalQuoted, quoteChar });
    }
  }

  // ── Priority 2: Bare copy strings not part of a dict ──────────────────────
  // Skip HTML attribute contexts (class=, id=, href=, style=, data-*)
  // by excluding strings immediately preceded by =
  const strRe = /(["'])((?:(?!\1)[^\\]|\\.)+)\1/g;
  // Build the set of positions already claimed by dict matches
  const dictPositions = new Set<number>();
  {
    const tmpRe = /(['"])((?:(?!\1)[^\\]|\\.)*)\1\s*:\s*(['"])((?:(?!\3)[^\\]|\\.)*)\3/g;
    let tmp: RegExpExecArray | null;
    while ((tmp = tmpRe.exec(code)) !== null) {
      for (let i = tmp.index; i < tmp.index + tmp[0].length; i++) dictPositions.add(i);
    }
  }

  while ((m = strRe.exec(code)) !== null) {
    if (dictPositions.has(m.index)) continue; // already captured as a dict value or key

    const quoteChar = m[1];
    const value = m[2];
    const originalQuoted = `${quoteChar}${value}${quoteChar}`;
    if (seen.has(originalQuoted)) continue;

    // Skip HTML attribute values: look for '=' immediately before the quote
    const before = code.slice(Math.max(0, m.index - 3), m.index).trimEnd();
    if (before.endsWith('=')) continue;

    // Apply copy heuristic to standalone strings
    if (isCopy(value)) {
      seen.add(originalQuoted);
      items.push({ key: null, value, originalQuoted, quoteChar });
    }
  }

  return items;
}

/**
 * Basic Jinja2 structural linter.
 */
export function lintJinja(code: string): string[] {
  const errors: string[] = [];
  const blockOpen = (code.match(/\{%/g) ?? []).length;
  const blockClose = (code.match(/%\}/g) ?? []).length;
  if (blockOpen !== blockClose)
    errors.push(`Unbalanced block tags — ${blockOpen} {%  vs  ${blockClose} %}`);

  const varOpen = (code.match(/\{\{/g) ?? []).length;
  const varClose = (code.match(/\}\}/g) ?? []).length;
  if (varOpen !== varClose)
    errors.push(`Unbalanced variable tags — ${varOpen} {{  vs  ${varClose} }}`);

  return errors;
}

/**
 * Basic AMPscript structural linter.
 *
 * This is intentionally shallow: it only checks for balanced block delimiters,
 * which is the same level of validation the Safe Edit overlay can reliably
 * enforce without parsing the full language grammar.
 */
export function lintAmpScript(code: string): string[] {
  const errors: string[] = [];
  const blockOpen = (code.match(/%%\[/g) ?? []).length;
  const blockClose = (code.match(/\]%%/g) ?? []).length;

  if (blockOpen !== blockClose) {
    errors.push(`Unbalanced AMPscript block tags — ${blockOpen} %%[  vs  ${blockClose} ]%%`);
  }

  return errors;
}

export function lintTemplateSyntax(code: string): string[] {
  return [...lintJinja(code), ...lintAmpScript(code)];
}
