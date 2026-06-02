export interface Token {
  type: 'block' | 'var' | 'comment' | 'html';
  val: string;
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === '{' && src[i + 1] === '#') {
      const end = src.indexOf('#}', i + 2);
      if (end === -1) { tokens.push({ type: 'comment', val: src.slice(i) }); break; }
      tokens.push({ type: 'comment', val: src.slice(i, end + 2) });
      i = end + 2;
    } else if (src[i] === '{' && src[i + 1] === '%') {
      const end = src.indexOf('%}', i + 2);
      if (end === -1) { tokens.push({ type: 'block', val: src.slice(i) }); break; }
      tokens.push({ type: 'block', val: src.slice(i, end + 2) });
      i = end + 2;
    } else if (src[i] === '{' && src[i + 1] === '{') {
      const end = src.indexOf('}}', i + 2);
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

function highlightInner(inner: string): string {
  const STRING_RE = /(["'])(?:(?!\1)[^\\]|\\.)*\1/g;
  const NUM_RE = /\b(\d+(?:\.\d+)?)\b/g;
  const FILTER_RE = /\|\s*([a-z_]+)/g;
  const BLOCK_KW = /\b(if|elif|else|endif|for|endfor|set|block|endblock|extends|include|import|macro|endmacro|call|endcall|filter|endfilter|raw|endraw|with|endwith|without context|scoped|recursive|namespace|not|and|or|in|is|true|false|none|loop)\b/g;
  let h = escapeHtml(inner);
  h = h.replace(STRING_RE, (m) => `<span class="tk-string">${m}</span>`);
  h = h.replace(NUM_RE, (_, n) => `<span class="tk-number">${n}</span>`);
  h = h.replace(FILTER_RE, (_, f) => `| <span class="tk-filter">${f}</span>`);
  h = h.replace(BLOCK_KW, (m) => `<span class="tk-keyword">${m}</span>`);
  return h;
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
        const pad = '  '.repeat(indent);
        lines.push(pad + `<span class="tk-block">{%</span> ${highlightInner(inner)} <span class="tk-block">%}</span>`);
      }
    }
  }
  flush();
  return lines.join('\n');
}

export const JINJA_EXAMPLE = '{% set offers = namespace(count=0) %}{% for offer in offers_list %}{% if offer.active and offer.lob == "joe_fresh" %}{% set offers.count = offers.count + 1 %}<div class="offer-card">{% if offer.discount_type == "percent" %}<span class="badge">{{ offer.value }}% off</span>{% elif offer.discount_type == "flat" %}<span class="badge">${{ offer.value }} off</span>{% else %}<span class="badge">{{ offer.value }}</span>{% endif %}<h3>{{ offer.title | title }}</h3><p>{{ offer.description | truncate(120) }}</p>{% if offer.expiry %}<small>Expires: {{ offer.expiry | date("%-d %b %Y") }}</small>{% endif %}</div>{% endif %}{% endfor %}{% if offers.count == 0 %}<p class="no-offers">No offers available.</p>{% endif %}';
