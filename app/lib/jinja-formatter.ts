export interface Token {
  type: 'block' | 'var' | 'comment' | 'html';
  val: string;
}

// Find the closing token for a Jinja tag while respecting quoted strings.
// This prevents sequences like "%}" inside a string literal from ending a
// block token too early.
function findTagEnd(src: string, from: number, close: string): number {
  let inStr: string | null = null;

  for (let i = from; i < src.length - 1; i++) {
    const ch = src[i];

    if (inStr) {
      if (ch === '\\') {
        i++; // skip escaped character inside string
        continue;
      }
      if (ch === inStr) {
        inStr = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }

    if (src[i] === close[0] && src[i + 1] === close[1]) {
      return i;
    }
  }

  return -1;
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === '{' && src[i + 1] === '#') {
      // Jinja comments don't have string semantics; use direct close search so
      // apostrophes in natural language (e.g., "it's") don't swallow the file.
      const end = src.indexOf('#}', i + 2);
      if (end === -1) { tokens.push({ type: 'comment', val: src.slice(i) }); break; }
      tokens.push({ type: 'comment', val: src.slice(i, end + 2) });
      i = end + 2;
    } else if (src[i] === '{' && src[i + 1] === '%') {
      const end = findTagEnd(src, i + 2, '%}');
      if (end === -1) { tokens.push({ type: 'block', val: src.slice(i) }); break; }
      tokens.push({ type: 'block', val: src.slice(i, end + 2) });
      i = end + 2;
    } else if (src[i] === '{' && src[i + 1] === '{') {
      const end = findTagEnd(src, i + 2, '}}');
      if (end === -1) { tokens.push({ type: 'var', val: src.slice(i) }); break; }
      tokens.push({ type: 'var', val: src.slice(i, end + 2) });
      i = end + 2;
    } else {
      let j = i;
      while (j < src.length && !(src[j] === '{' && (src[j + 1] === '%' || src[j + 1] === '{' || src[j + 1] === '#'))) j++;
      tokens.push({ type: 'html', val: src.slice(i, j) });
      i = j;
    }
  }
  return tokens;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Apply a regex only to plain-text chunks, skipping anything inside an HTML tag.
// This prevents regexes from corrupting class/attribute values after earlier
// replacements have already inserted <span> elements into the string.
function onText(
  html: string,
  re: RegExp,
  repl: (...args: string[]) => string,
): string {
  return html.replace(/(<[^>]+>|[^<]+)/g, (chunk) =>
    chunk.startsWith('<') ? chunk : chunk.replace(re, repl),
  );
}

function highlightInner(inner: string): string {
  const STRING_RE = /(["'])(?:(?!\1)[^\\]|\\.)*\1/g;
  const NUM_RE    = /\b(\d+(?:\.\d+)?)\b/g;
  const FILTER_RE = /\|\s*([a-z_]+)/g;
  // 'filter' and 'endfilter' are in this list — without onText they would
  // corrupt class="tk-filter" by matching inside the attribute value.
  const BLOCK_KW  = /\b(if|elif|else|endif|for|endfor|set|block|endblock|extends|include|import|macro|endmacro|call|endcall|filter|endfilter|raw|endraw|with|endwith|without context|scoped|recursive|namespace|not|and|or|in|is|true|false|none|loop)\b/g;

  let h = escapeHtml(inner);
  // STRING_RE is safe to apply first — no HTML tags exist yet.
  h = h.replace(STRING_RE, (m) => `<span class="tk-string">${m}</span>`);
  // All subsequent passes use onText so they never touch HTML attribute values.
  h = onText(h, NUM_RE,    (_, n) => `<span class="tk-number">${n}</span>`);
  h = onText(h, FILTER_RE, (_, f) => `| <span class="tk-filter">${f}</span>`);
  h = onText(h, BLOCK_KW,  (m)    => `<span class="tk-keyword">${m}</span>`);
  return h;
}

// Split `s` at top-level occurrences of `sep`, honouring string literals and
// bracket nesting so commas inside strings / parens / brackets are ignored.
function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let buf = '';

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      buf += ch;
      if (ch === '\\' && i + 1 < s.length) {
        buf += s[++i]; // escaped character — skip ahead
      } else if (ch === inStr) {
        inStr = null;
      }
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
      buf += ch;
    } else if ('([{'.includes(ch)) {
      depth++;
      buf += ch;
    } else if (')]}'.includes(ch)) {
      depth--;
      buf += ch;
    } else if (ch === sep && depth === 0) {
      const t = buf.trim();
      if (t) parts.push(t);
      buf = '';
    } else {
      buf += ch;
    }
  }
  const t = buf.trim();
  if (t) parts.push(t);
  return parts;
}

// If `inner` is a {% set var = { key: val, … } %} block with multiple entries,
// returns an array of formatted HTML lines; otherwise returns null.
function tryFormatDictSet(inner: string, indent: number): string[] | null {
  // Strip whitespace-control dashes then trim
  const clean = inner.replace(/^-\s*/, '').replace(/\s*-$/, '').trim();

  // Must start with "set <var> ="
  const setMatch = clean.match(/^(set\s+[\w.]+\s*=\s*)/);
  if (!setMatch) return null;

  const prefix = setMatch[1].trim();
  const rest   = clean.slice(setMatch[0].length).trim();
  if (!rest.startsWith('{')) return null;

  // Find the MATCHING closing } using bracket-counting so apostrophes /
  // nested {} / commas inside strings cannot confuse the search.
  let depth = 0;
  let dictEnd = -1;
  let inStr: string | null = null;

  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
    } else if (ch === '{' || ch === '[' || ch === '(') {
      depth++;
    } else if (ch === '}' || ch === ']' || ch === ')') {
      depth--;
      if (depth === 0) { dictEnd = i; break; }
    }
  }

  if (dictEnd === -1) return null;

  const body       = rest.slice(1, dictEnd).trim();
  const afterClose = rest.slice(dictEnd + 1).trim();
  if (afterClose) return null; // unexpected content after closing }

  const pairs = splitTopLevel(body, ',');
  if (pairs.length <= 1) return null;

  const pad  = '  '.repeat(Math.max(0, indent));
  const ipad = '  '.repeat(Math.max(0, indent + 1));

  return [
    `${pad}<span class="tk-block">{%</span> ${highlightInner(prefix)} {`,
    ...pairs.map((p, i) => {
      const trailing = i < pairs.length - 1 ? ',' : '';
      return `${ipad}${highlightInner(p)}${trailing}`;
    }),
    `${pad}} <span class="tk-block">%}</span>`,
  ];
}

const OPENERS = ['if', 'for', 'block', 'macro', 'call', 'filter', 'with', 'raw'];
const CLOSERS = ['endif', 'endfor', 'endblock', 'endmacro', 'endcall', 'endfilter', 'endwith', 'endraw'];
const MIDDLES = ['else', 'elif'];

function getFirstKeyword(val: string): string {
  // Strip whitespace-control dashes: {%- ... -%} → inner trim → first word
  return val.slice(2, -2).trim().replace(/^-\s*/, '').split(/\s+/)[0];
}

export function formatJinja(src: string): string {
  const tokens = tokenize(src.trim());
  let indent = 0;
  const lines: string[] = [];
  let currentLine = '';

  function flush() {
    if (currentLine !== '') {
      const pad = '  '.repeat(Math.max(0, indent));
      lines.push(pad + currentLine);
      currentLine = '';
    }
  }

  for (const tok of tokens) {
    if (tok.type === 'html') {
      const parts = tok.val.split('\n');
      for (let pi = 0; pi < parts.length; pi++) {
        const p = parts[pi];
        if (pi > 0) flush();
        if (p.trim()) currentLine += escapeHtml(p);
        else if (p === '' && pi > 0) flush();
      }
    } else if (tok.type === 'comment') {
      flush();
      const pad = '  '.repeat(Math.max(0, indent));
      const inner = tok.val.slice(2, -2).trim();
      lines.push(pad + `<span class="tk-comment">{# ${escapeHtml(inner)} #}</span>`);
    } else if (tok.type === 'var') {
      const inner = tok.val.slice(2, -2).trim();
      currentLine += `<span class="tk-var">{{</span> ${highlightInner(inner)} <span class="tk-var">}}</span>`;
    } else if (tok.type === 'block') {
      const kw = getFirstKeyword(tok.val);
      const inner = tok.val.slice(2, -2).trim();
      if (CLOSERS.includes(kw)) {
        flush();
        indent = Math.max(0, indent - 1);
        const pad = '  '.repeat(indent);
        lines.push(pad + `<span class="tk-block">{%</span> <span class="tk-keyword">${escapeHtml(inner)}</span> <span class="tk-block">%}</span>`);
      } else if (MIDDLES.includes(kw)) {
        flush();
        const pad = '  '.repeat(Math.max(0, indent - 1));
        lines.push(pad + `<span class="tk-block">{%</span> ${highlightInner(inner)} <span class="tk-block">%}</span>`);
      } else if (OPENERS.includes(kw)) {
        flush();
        const pad = '  '.repeat(indent);
        lines.push(pad + `<span class="tk-block">{%</span> ${highlightInner(inner)} <span class="tk-block">%}</span>`);
        indent++;
      } else {
        flush();
        // Try to expand {% set var = { key: val, … } %} into one line per entry
        const dictLines = tryFormatDictSet(inner, indent);
        if (dictLines) {
          lines.push(...dictLines);
        } else {
          const pad = '  '.repeat(indent);
          lines.push(pad + `<span class="tk-block">{%</span> ${highlightInner(inner)} <span class="tk-block">%}</span>`);
        }
      }
    }
  }
  flush();
  return lines.join('\n');
}

export const JINJA_EXAMPLE = '{% set offers = namespace(count=0) %}{% for offer in offers_list %}{% if offer.active and offer.lob == "joe_fresh" %}{% set offers.count = offers.count + 1 %}<div class="offer-card">{% if offer.discount_type == "percent" %}<span class="badge">{{ offer.value }}% off</span>{% elif offer.discount_type == "flat" %}<span class="badge">${{ offer.value }} off</span>{% else %}<span class="badge">{{ offer.value }}</span>{% endif %}<h3>{{ offer.title | title }}</h3><p>{{ offer.description | truncate(120) }}</p>{% if offer.expiry %}<small>Expires: {{ offer.expiry | date("%-d %b %Y") }}</small>{% endif %}</div>{% endif %}{% endfor %}{% if offers.count == 0 %}<p class="no-offers">No offers available.</p>{% endif %}';
