'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Copy, Trash2, FileCode, Check, Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatJinja, formatLiquid, formatAMPscript, JINJA_EXAMPLE } from '@/app/lib/jinja-formatter';
import { extractStrings } from '@/app/lib/string-extractor';
import { recordAnalysis } from '@/app/lib/stats';

type Language = 'jinja' | 'liquid' | 'ampscript';

const LANGUAGES: { id: Language; label: string; platform: string }[] = [
  { id: 'jinja',     label: 'Jinja',     platform: 'MoEngage · Klaviyo' },
  { id: 'liquid',    label: 'Liquid',    platform: 'Braze · Shopify' },
  { id: 'ampscript', label: 'AMPscript', platform: 'SFMC' },
];

function runFormatter(lang: Language, src: string): string {
  if (lang === 'liquid')    return formatLiquid(src);
  if (lang === 'ampscript') return formatAMPscript(src);
  return formatJinja(src);
}

function minify(text: string): string {
  return text.split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
}

// activeIndex = which hit gets the orange "current match" style; -1 = none
// Uses inline styles so Tailwind preflight can't override them
function applySearchHighlights(html: string, term: string, activeIndex = -1): string {
  if (!term.trim()) return html;
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let hitNum = 0;
  return html.replace(/(<[^>]+>|[^<]+)/g, (chunk) => {
    if (chunk.startsWith('<')) return chunk;
    return chunk.replace(new RegExp(esc, 'gi'), (m) => {
      const isActive = hitNum++ === activeIndex;
      const style = isActive
        ? 'background:#f97316;color:#fff;border-radius:2px;padding:0 1px'
        : 'background:rgba(250,204,21,0.6);border-radius:2px;padding:0 1px';
      return `<span class="search-hit${isActive ? ' search-hit-active' : ''}" style="${style}">${m}</span>`;
    });
  });
}

export default function JinjaFormatter() {
  const [language, setLanguage] = useState<Language>('jinja');
  const [raw, setRaw] = useState('');
  const [formatted, setFormatted] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedString, setCopiedString] = useState<string | null>(null);
  const [rawCopied, setRawCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [rawCollapsed, setRawCollapsed] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [copyEdit, setCopyEdit] = useState<{
    originalQuoted: string;
    quoteChar: string;
    value: string;
    top: number; left: number; width: number; height: number;
  } | null>(null);

  const fmtRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const prevSearchRef = useRef('');

  // ── Divider drag ───────────────────────────────────────────────────────────
  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMouseMove(ev: MouseEvent) {
      if (!panelsRef.current) return;
      const rect = panelsRef.current.getBoundingClientRect();
      setSplitPercent(Math.min(75, Math.max(25, ((ev.clientX - rect.left) / rect.width) * 100)));
    }
    function onMouseUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // ── Auto-collapse header when content is present ───────────────────────────
  useEffect(() => {
    setHeaderCollapsed(!!raw.trim());
  }, [!!raw.trim()]);

  // ── Auto-format raw → formatted (debounced) ────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setFormatted(raw.trim() ? runFormatter(language, raw) : '');
    }, 150);
    return () => clearTimeout(timer);
  }, [raw, language]);

  const extractedStrings = useMemo(() => (raw.trim() ? extractStrings(raw) : []), [raw]);

  // ── Search ─────────────────────────────────────────────────────────────────
  const matchCount = useMemo(() => {
    if (!searchTerm.trim() || !formatted) return 0;
    const plain = formatted.replace(/<[^>]+>/g, '');
    const esc = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (plain.match(new RegExp(esc, 'gi')) || []).length;
  }, [searchTerm, formatted]);

  const highlightedHtml = useMemo(() => {
    const base = formatted
      || '<span style="color:var(--text-muted)">Formatted output will appear here...</span>';
    return applySearchHighlights(base, searchTerm, matchIndex);
  }, [formatted, searchTerm, matchIndex]);

  useEffect(() => {
    const isNewSearch = searchTerm !== prevSearchRef.current;
    prevSearchRef.current = searchTerm;
    if (isNewSearch && matchIndex !== 0) { setMatchIndex(0); return; }
    requestAnimationFrame(() => {
      fmtRef.current?.querySelector<HTMLElement>('.search-hit-active')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [formatted, searchTerm, matchIndex]);

  function navigate(dir: 1 | -1) {
    if (matchCount === 0) return;
    setMatchIndex((i) => (i + dir + matchCount) % matchCount);
  }

  // ── Inline copy editor ─────────────────────────────────────────────────────
  function handleStringClick(e: React.MouseEvent) {
    const clicked = e.target as HTMLElement;
    const span = clicked.classList.contains('tk-string')
      ? clicked
      : clicked.closest<HTMLElement>('.tk-string');
    if (!span) return; // non-string click — do nothing
    e.stopPropagation();
    const fullString = span.textContent ?? '';
    if (fullString.length < 2) return;
    const rect = span.getBoundingClientRect();
    setCopyEdit({
      originalQuoted: fullString,
      quoteChar: fullString[0],
      value: fullString.slice(1, -1),
      top: rect.top, left: rect.left,
      width: Math.max(rect.width, 240),
      height: rect.height,
    });
  }

  function commitCopyEdit(newValue: string) {
    if (!copyEdit) return;
    const { quoteChar, originalQuoted } = copyEdit;
    const newQuoted = `${quoteChar}${newValue}${quoteChar}`;
    setCopyEdit(null);
    if (newQuoted === originalQuoted) return;

    // Replace in raw using the current value (not functional update) so we can
    // also compute newRaw here and update formatted immediately — bypassing the
    // 150 ms debounce. Without this, clicking the same string again within 150 ms
    // captures the OLD originalQuoted (still shown in formatted) which is no longer
    // in raw, so the replace silently fails.
    const newRaw = raw.replace(originalQuoted, newQuoted);
    setRaw(newRaw);
    setFormatted(newRaw.trim() ? runFormatter(language, newRaw) : '');
  }

  // ── Misc ───────────────────────────────────────────────────────────────────
  function handleRawChange(value: string) {
    setRaw(value.replace(/\n/g, ' '));
  }

  function handleClear() {
    setRaw('');
    setFormatted('');
    setSearchTerm('');
    setCopyEdit(null);
  }

  function handleExample() {
    setRaw(minify(JINJA_EXAMPLE));
    recordAnalysis();
  }

  async function handleCopy() {
    const text = fmtRef.current?.innerText ?? '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const fmtLines = formatted ? formatted.split('\n').length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '12px', minHeight: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <button
          onClick={() => setHeaderCollapsed((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-primary)' }}
          title={headerCollapsed ? 'Expand header' : 'Collapse header'}
        >
          <span style={{ fontSize: '16px', fontWeight: 600 }}>Template Formatter</span>
          {headerCollapsed
            ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
            : <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />}
        </button>
        {/* Language picker */}
        <div style={{ display: 'flex', gap: '3px', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px', padding: '3px' }}>
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              onClick={() => setLanguage(lang.id)}
              title={lang.platform}
              style={{
                padding: '4px 11px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: 500,
                background: language === lang.id ? 'var(--accent)' : 'transparent',
                color: language === lang.id ? '#fff' : 'var(--text-muted)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {lang.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <button className="btn-ghost" onClick={handleExample}><FileCode size={14} /> Load example</button>
          <button className="btn-ghost btn-danger" onClick={handleClear}><Trash2 size={14} /> Clear</button>
        </div>
      </div>

      {!headerCollapsed && (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-4px' }}>
          {language === 'jinja'     && 'Paste a minified blob → readable output · click any string to edit · MoEngage · Klaviyo'}
          {language === 'liquid'    && 'Paste a minified Liquid blob → readable output · click any string to edit · Braze · Shopify'}
          {language === 'ampscript' && 'Paste a minified AMPscript blob → readable output · SFMC'}
        </p>
      )}

      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '7px 12px',
        background: 'var(--bg-panel)',
        border: `1.5px solid ${searchFocused ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '8px', flexShrink: 0,
        boxShadow: searchFocused ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}>
        <Search size={14} style={{ color: searchFocused ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0, transition: 'color 0.15s' }} />
        <input
          type="text"
          placeholder="Search in formatted output…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate(e.shiftKey ? -1 : 1);
            if (e.key === 'Escape') setSearchTerm('');
          }}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'inherit' }}
        />
        {searchTerm && (
          <>
            <span style={{ fontSize: '11px', color: matchCount > 0 ? 'var(--text-muted)' : '#dc2626', flexShrink: 0, minWidth: '60px', textAlign: 'right' }}>
              {matchCount > 0 ? `${matchIndex + 1} / ${matchCount}` : 'no matches'}
            </span>
            <button className="icon-btn" onClick={() => navigate(-1)} title="Previous (Shift+Enter)"><ChevronUp size={12} /></button>
            <button className="icon-btn" onClick={() => navigate(1)} title="Next (Enter)"><ChevronDown size={12} /></button>
            <button className="icon-btn" onClick={() => setSearchTerm('')} title="Clear search"><X size={12} /></button>
          </>
        )}
      </div>

      {/* Panels */}
      <div ref={panelsRef} style={{ display: 'flex', flex: 1, minHeight: 0, gap: 0 }}>

        {/* Raw — collapses to a thin strip */}
        <div className="panel" style={{
          display: 'flex', flexDirection: 'column', minHeight: 0,
          flexBasis: rawCollapsed ? '28px' : `${splitPercent}%`,
          flexShrink: 0, flexGrow: 0, minWidth: 0,
          overflow: 'hidden', transition: 'flex-basis 0.2s ease',
        }}>
          {rawCollapsed ? (
            <button
              onClick={() => setRawCollapsed(false)}
              title="Expand RAW / BLOB panel"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', border: 'none', background: 'transparent', cursor: 'pointer', gap: '10px', color: 'var(--text-muted)', padding: '12px 0' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            >
              <ChevronRight size={13} />
              <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                RAW
              </span>
            </button>
          ) : (
            <>
              <div className="panel-header">
                <span>Raw / Blob</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="badge">{raw.length} chars</span>
                  <button
                    className="icon-btn"
                    onClick={async () => {
                      await navigator.clipboard.writeText(raw);
                      setRawCopied(true);
                      setTimeout(() => setRawCopied(false), 1500);
                    }}
                    disabled={!raw}
                    title="Copy raw blob"
                  >
                    {rawCopied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                  <button className="icon-btn" onClick={() => setRawCollapsed(true)} title="Collapse RAW panel">
                    <ChevronLeft size={12} />
                  </button>
                </div>
              </div>
              <textarea
                className="mono code-area"
                value={raw}
                onChange={(e) => handleRawChange(e.target.value)}
                onPaste={() => setTimeout(recordAnalysis, 0)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                placeholder="Paste your single-line Jinja blob here..."
                spellCheck={false}
                style={{ flex: 1, resize: 'none', whiteSpace: 'nowrap', overflowX: 'auto', overflowY: 'hidden', minHeight: 0 }}
              />
              <div className="panel-footer">Single-line blob only · formats automatically</div>
            </>
          )}
        </div>

        {/* Drag divider */}
        {!rawCollapsed && (
          <div onMouseDown={onDividerMouseDown} onDoubleClick={() => setSplitPercent(50)} title="Drag to resize · Double-click to reset"
            style={{ width: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'col-resize', zIndex: 1 }}>
            <div style={{ width: '3px', height: '36px', borderRadius: '99px', background: 'var(--border)', transition: 'background 0.15s' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--accent)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--border)')} />
          </div>
        )}

        {/* Formatted — display-only, strings clickable for copy editing */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, minWidth: 0 }}>
          <div className="panel-header">
            <span>Formatted</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {fmtLines > 0 && <span className="badge">{fmtLines} lines</span>}
              <button className="icon-btn" onClick={handleCopy} disabled={!formatted} title="Copy formatted">
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          <div
            ref={fmtRef}
            className="mono code-area formatted-pane"
            style={{ flex: 1, overflow: 'auto', padding: '12px', minHeight: 0, outline: 'none' }}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            onClick={formatted ? handleStringClick : undefined}
          />

          <div className="panel-footer">
            {formatted ? 'Click any string to edit copy · raw updates instantly' : 'Waiting for input'}
          </div>
        </div>

      </div>

      {/* Strings panel — copyable chips for all quoted strings */}
      {extractedStrings.length > 0 && (
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
            Strings · {extractedStrings.length}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {extractedStrings.map((s, i) => (
              <button
                key={i}
                title={`Click to copy: ${s.value}`}
                onClick={async () => {
                  await navigator.clipboard.writeText(s.value);
                  setCopiedString(s.value);
                  setTimeout(() => setCopiedString(null), 1500);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '3px 10px 3px 8px',
                  background: copiedString === s.value ? 'rgba(37,99,235,0.12)' : 'var(--bg-panel)',
                  border: `1px solid ${copiedString === s.value ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '99px', cursor: 'pointer',
                  fontSize: '11.5px', color: 'var(--token-string)',
                  fontFamily: '"JetBrains Mono","Fira Code",ui-monospace,monospace',
                  maxWidth: '260px', transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {copiedString === s.value
                  ? <Check size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  : <Copy size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.key ? `${s.key}: ` : ''}{s.value}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Copy-edit overlay — React-controlled, positioned over the clicked string */}
      {copyEdit && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setCopyEdit(null)} />
          <input
            autoFocus
            defaultValue={copyEdit.value}
            spellCheck={false}
            style={{
              position: 'fixed',
              top: copyEdit.top - 2,
              left: copyEdit.left - 6,
              minWidth: copyEdit.width + 12,
              height: copyEdit.height + 4,
              zIndex: 1000,
              background: 'var(--bg-panel)',
              border: '2px solid var(--accent)',
              borderRadius: '4px',
              color: 'var(--token-string)',
              fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code",ui-monospace,monospace',
              fontSize: '12.5px',
              lineHeight: '1.7',
              padding: '0 6px',
              outline: 'none',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  { e.preventDefault(); commitCopyEdit((e.target as HTMLInputElement).value); }
              if (e.key === 'Escape') { setCopyEdit(null); }
            }}
            onBlur={(e) => commitCopyEdit(e.target.value)}
          />
        </>
      )}
    </div>
  );
}
