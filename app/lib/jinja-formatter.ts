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

// Apply a regex only to plain-text chunks that are NOT inside a tk-string span.
// Skips HTML tags (so attribute values are never corrupted) and also skips
// text that lives inside <span class="tk-string">…</span> so keywords like
// `in` / `not` / `is` are never highlighted inside string literals.
function onText(
  html: string,
  re: RegExp,
  repl: (...args: string[]) => string,
): string {
  let inString = false;
  return html.replace(/(<[^>]+>|[^<]+)/g, (chunk) => {
    if (chunk.startsWith('<')) {
      // Track whether we're entering or leaving a tk-string span
      if (/^<span\b[^>]*\btk-string\b/.test(chunk)) inString = true;
      else if (chunk === '</span>' && inString) inString = false;
      return chunk;
    }
    // Plain text — only apply the regex when outside a string span
    return inString ? chunk : chunk.replace(re, repl);
  });
}

function highlightInner(inner: string): string {
  const STRING_RE = /(["'])(?:(?!\1)[^\\]|\\.)*\1/g;
  const NUM_RE = /\b(\d+(?:\.\d+)?)\b/g;
  const FILTER_RE = /\|\s*([a-z_]+)/g;
  // 'filter' and 'endfilter' are in this list — without onText they would
  // corrupt class="tk-filter" by matching inside the attribute value.
  const BLOCK_KW = /\b(if|elif|else|endif|for|endfor|set|block|endblock|extends|include|import|macro|endmacro|call|endcall|filter|endfilter|raw|endraw|with|endwith|without context|scoped|recursive|namespace|not|and|or|in|is|true|false|none|loop)\b/g;

  let h = escapeHtml(inner);
  // STRING_RE is safe to apply first — no HTML tags exist yet.
  h = h.replace(STRING_RE, (m) => `<span class="tk-string">${m}</span>`);
  // All subsequent passes use onText so they never touch HTML attribute values.
  h = onText(h, NUM_RE, (_, n) => `<span class="tk-number">${n}</span>`);
  h = onText(h, FILTER_RE, (_, f) => `| <span class="tk-filter">${f}</span>`);
  h = onText(h, BLOCK_KW, (m) => `<span class="tk-keyword">${m}</span>`);
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
  const rest = clean.slice(setMatch[0].length).trim();
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

  const body = rest.slice(1, dictEnd).trim();
  const afterClose = rest.slice(dictEnd + 1).trim();
  if (afterClose) return null; // unexpected content after closing }

  const pairs = splitTopLevel(body, ',');
  if (pairs.length <= 1) return null;

  const pad = '  '.repeat(Math.max(0, indent));
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

// ── Liquid (Braze / Klaviyo / Shopify) ───────────────────────────────────────

const LIQUID_OPENERS = ['if', 'unless', 'for', 'case', 'capture', 'form', 'tablerow', 'paginate', 'raw'];
const LIQUID_CLOSERS = ['endif', 'endunless', 'endfor', 'endcase', 'endcapture', 'endform', 'endtablerow', 'endpaginate', 'endraw'];
const LIQUID_MIDDLES = ['else', 'elsif', 'when'];

function highlightLiquidInner(inner: string): string {
  const STRING_RE = /(["'])(?:(?!\1)[^\\]|\\.)*\1/g;
  const NUM_RE    = /\b(\d+(?:\.\d+)?)\b/g;
  const FILTER_RE = /\|\s*([a-z_]+)/g;
  const KW_RE     = /\b(if|elsif|else|endif|unless|endunless|for|endfor|in|case|when|endcase|assign|capture|endcapture|include|render|layout|section|break|continue|cycle|increment|decrement|limit|offset|reversed|tablerow|endtablerow|paginate|endpaginate|empty|blank|nil|null|true|false|and|or|not|contains|forloop|connected_content|abort_message)\b/g;
  let h = escapeHtml(inner);
  h = h.replace(STRING_RE, (m) => `<span class="tk-string">${m}</span>`);
  h = onText(h, NUM_RE,    (_, n) => `<span class="tk-number">${n}</span>`);
  h = onText(h, FILTER_RE, (_, f) => `| <span class="tk-filter">${f}</span>`);
  h = onText(h, KW_RE,     (m)    => `<span class="tk-keyword">${m}</span>`);
  return h;
}

export function formatLiquid(src: string): string {
  const tokens = tokenize(src.trim());
  let indent = 0;
  const lines: string[] = [];
  let currentLine = '';
  function flush() {
    if (currentLine !== '') { lines.push('  '.repeat(Math.max(0, indent)) + currentLine); currentLine = ''; }
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
      lines.push('  '.repeat(Math.max(0, indent)) + `<span class="tk-comment">{# ${escapeHtml(tok.val.slice(2, -2).trim())} #}</span>`);
    } else if (tok.type === 'var') {
      currentLine += `<span class="tk-var">{{</span> ${highlightLiquidInner(tok.val.slice(2, -2).trim())} <span class="tk-var">}}</span>`;
    } else if (tok.type === 'block') {
      const kw    = getFirstKeyword(tok.val);
      const inner = tok.val.slice(2, -2).trim();
      if (LIQUID_CLOSERS.includes(kw)) {
        flush(); indent = Math.max(0, indent - 1);
        lines.push('  '.repeat(indent) + `<span class="tk-block">{%</span> <span class="tk-keyword">${escapeHtml(inner)}</span> <span class="tk-block">%}</span>`);
      } else if (LIQUID_MIDDLES.includes(kw)) {
        flush();
        lines.push('  '.repeat(Math.max(0, indent - 1)) + `<span class="tk-block">{%</span> ${highlightLiquidInner(inner)} <span class="tk-block">%}</span>`);
      } else if (LIQUID_OPENERS.includes(kw)) {
        flush();
        lines.push('  '.repeat(indent) + `<span class="tk-block">{%</span> ${highlightLiquidInner(inner)} <span class="tk-block">%}</span>`);
        indent++;
      } else {
        flush();
        lines.push('  '.repeat(indent) + `<span class="tk-block">{%</span> ${highlightLiquidInner(inner)} <span class="tk-block">%}</span>`);
      }
    }
  }
  flush();
  return lines.join('\n');
}

// ── AMPscript (SFMC) ─────────────────────────────────────────────────────────

interface AMPToken { type: 'block' | 'inline' | 'text'; val: string }

function tokenizeAMPscript(src: string): AMPToken[] {
  const tokens: AMPToken[] = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === '%' && src[i + 1] === '%' && src[i + 2] === '[') {
      const end = src.indexOf(']%%', i + 3);
      if (end === -1) { tokens.push({ type: 'block', val: src.slice(i) }); break; }
      tokens.push({ type: 'block', val: src.slice(i, end + 3) }); i = end + 3;
    } else if (src[i] === '%' && src[i + 1] === '%' && src[i + 2] === '=') {
      const end = src.indexOf('=%%', i + 3);
      if (end === -1) { tokens.push({ type: 'inline', val: src.slice(i) }); break; }
      tokens.push({ type: 'inline', val: src.slice(i, end + 3) }); i = end + 3;
    } else {
      let j = i;
      while (j < src.length && !(src[j] === '%' && src[j + 1] === '%')) j++;
      if (j > i) tokens.push({ type: 'text', val: src.slice(i, j) });
      i = j === i ? i + 1 : j;
    }
  }
  return tokens;
}

function highlightAMPInner(line: string): string {
  const KW_RE  = /\b(VAR|SET|IF|ELSEIF|ELSE|ENDIF|FOR|NEXT|DO|UNTIL|AND|OR|NOT|TRUE|FALSE|THEN|TO)\b/gi;
  const FN_RE  = /\b(AttributeValue|IIF|CONCAT|EMPTY|Format|DateAdd|Now|DateDiff|Lookup|LookupRows|v|Substring|Length|Trim|Upper|Lower|Replace|ProperCase|Row|Field|RowCount)\b/g;
  const VAR_RE = /(@\w+)/g;
  const STR_RE = /(["'])(?:(?!\1)[^\\]|\\.)*\1/g;
  let h = escapeHtml(line);
  h = h.replace(STR_RE, (m) => `<span class="tk-string">${m}</span>`);
  h = h.replace(FN_RE,  (m) => `<span class="tk-filter">${m}</span>`);
  h = h.replace(KW_RE,  (m) => `<span class="tk-keyword">${m}</span>`);
  h = h.replace(VAR_RE, (m) => `<span class="tk-var">${m}</span>`);
  return h;
}

function formatAMPBlock(content: string): string[] {
  const lines: string[] = [];
  let indent = 1;
  const stmts = content.split(/\r?\n/).flatMap((l) => l.trim() ? [l.trim()] : []);
  for (const stmt of stmts) {
    if (/^\s*(ENDIF|NEXT|UNTIL)\b/i.test(stmt)) indent = Math.max(1, indent - 1);
    lines.push('  '.repeat(indent) + highlightAMPInner(stmt));
    if (/^\s*(IF|FOR|DO)\b/i.test(stmt)) indent++;
  }
  return lines;
}

export function formatAMPscript(src: string): string {
  const tokens = tokenizeAMPscript(src.trim());
  const lines: string[] = [];
  let pendingText = '';
  function flushText() {
    if (!pendingText.trim()) { pendingText = ''; return; }
    pendingText.split('\n').forEach((p) => { if (p.trim()) lines.push(escapeHtml(p.trim())); });
    pendingText = '';
  }
  for (const tok of tokens) {
    if (tok.type === 'text') {
      pendingText += tok.val;
    } else if (tok.type === 'inline') {
      flushText();
      lines.push(`<span class="tk-block">%%=</span>${highlightAMPInner(tok.val.slice(3, -3).trim())}<span class="tk-block">=%%</span>`);
    } else {
      flushText();
      lines.push(`<span class="tk-block">%%[</span>`);
      lines.push(...formatAMPBlock(tok.val.slice(3, -3).trim()));
      lines.push(`<span class="tk-block">]%%</span>`);
    }
  }
  flushText();
  return lines.join('\n');
}

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

// Braze Liquid — tier-based loyalty email with filters and connected content
export const LIQUID_EXAMPLE = '{% assign tier = custom_attribute.${membership_tier} | default: "standard" | downcase %}{% assign first_name = ${first_name} | default: "there" %}{% assign points = custom_attribute.${loyalty_points} | default: 0 %}{% assign expiry = custom_attribute.${points_expiry_date} %}{% if tier == "platinum" %}{% assign badge = "Platinum Member" %}{% assign discount = 20 %}{% assign headline = first_name | prepend: "Your exclusive VIP reward is ready, " | append: "!" %}{% assign cta = "Claim my VIP reward" %}{% elsif tier == "gold" %}{% assign badge = "Gold Member" %}{% assign discount = 15 %}{% assign headline = "A special reward for our Gold members" %}{% assign cta = "Claim my Gold reward" %}{% elsif tier == "silver" %}{% assign badge = "Silver Member" %}{% assign discount = 10 %}{% assign headline = "A hand-picked offer just for you" %}{% assign cta = "See my offer" %}{% else %}{% assign badge = "Member" %}{% assign discount = 5 %}{% assign headline = "An offer just for you, " | append: first_name %}{% assign cta = "Explore offers" %}{% endif %}<div class="email-container"><span class="badge">{{ badge }}</span><h2>{{ headline }}</h2><p>You have <strong>{{ points | round }}</strong> points available{% if expiry %} — expires {{ expiry | date: "%B %d, %Y" }}{% endif %}.</p><div class="offer-pill">{{ discount }}% OFF your next order</div><a class="cta-btn" href="{{ deep_link | default: "#" }}">{{ cta }}</a>{% if discount >= 15 %}<p class="fine-print">Offer valid for {{ tier | capitalize }} members only. Cannot be combined with other promotions.</p>{% endif %}</div>';

// SFMC AMPscript — cart abandonment email with tiered discount logic
export const AMPSCRIPT_EXAMPLE = '%%[VAR @firstName, @tier, @cartValue, @productName, @discount, @headline, @cta SET @firstName = AttributeValue("FirstName") SET @tier = AttributeValue("MembershipTier") SET @cartValue = AttributeValue("AbandonedCartValue") SET @productName = AttributeValue("LastCartProduct") SET @discount = 0 IF @tier == "Platinum" THEN SET @discount = 20 SET @headline = CONCAT("Your cart is waiting, ", @firstName, " — plus an exclusive 20% off") ELSEIF @tier == "Gold" THEN SET @discount = 15 SET @headline = CONCAT("Come back for 15% off, ", @firstName) ELSE SET @discount = 10 SET @headline = IIF(NOT EMPTY(@firstName), CONCAT("You left something behind, ", @firstName), "You left something behind") ENDIF IF NOT EMPTY(@cartValue) THEN IF @cartValue > 100 THEN SET @cta = "Complete my order — save big" ELSE SET @cta = "Return to my cart" ENDIF ELSE SET @cta = "Return to my cart" ENDIF]%%<h2>%%=v(@headline)=%%</h2>%%[IF NOT EMPTY(@productName) THEN]%%<p>You left <strong>%%=v(@productName)=%%</strong> in your cart.</p>%%[ELSE]%%<p>You have items waiting in your cart.</p>%%[ENDIF]%%%%[IF @discount > 0 THEN]%%<div class="offer-pill">%%=v(@discount)=%%% OFF — use code <strong>SAVE%%=v(@discount)=%%</strong></div>%%[ENDIF]%%<a class="cta-btn" href="%%=RedirectTo(AttributeValue("CartURL"))=%%">%%=v(@cta)=%%</a>';
