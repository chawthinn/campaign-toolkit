'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Copy, Trash2, FileCode, Check, Search, ChevronUp, ChevronDown, X, Pencil } from 'lucide-react';
import { formatJinja, JINJA_EXAMPLE } from '@/app/lib/jinja-formatter';
import { recordAnalysis } from '@/app/lib/stats';

function minify(text: string): string {
  return text.split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
}

// Wraps search term matches in <mark> tags, skipping HTML tag content
function applySearchHighlights(html: string, term: string): string {
  if (!term.trim()) return html;
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(/(<[^>]+>|[^<]+)/g, (chunk) => {
    if (chunk.startsWith('<')) return chunk;
    return chunk.replace(
      new RegExp(esc, 'gi'),
      (m) => `<mark class="search-hit">${m}</mark>`,
    );
  });
}

export default function JinjaFormatter() {
  const [raw, setRaw] = useState('');
  const [formatted, setFormatted] = useState('');
  const [copied, setCopied] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const fmtRef = useRef<HTMLDivElement>(null);

  // Auto-format raw → formatted (debounced, skipped while in edit mode)
  useEffect(() => {
    if (editMode) return;
    const timer = setTimeout(() => {
      setFormatted(raw.trim() ? formatJinja(raw) : '');
    }, 150);
    return () => clearTimeout(timer);
  }, [raw, editMode]);

  // Count matches in formatted plain text
  const matchCount = useMemo(() => {
    if (!searchTerm.trim() || !formatted) return 0;
    const plain = formatted.replace(/<[^>]+>/g, '');
    const esc = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (plain.match(new RegExp(esc, 'gi')) || []).length;
  }, [searchTerm, formatted]);

  // Reset active match when term or content changes
  useEffect(() => { setMatchIndex(0); }, [searchTerm, formatted]);

  // Imperatively update the formatted div (syntax highlighting + search marks)
  useEffect(() => {
    if (!fmtRef.current || editMode) return;
    const base = formatted
      || '<span style="color:var(--text-muted)">Formatted output will appear here...</span>';
    fmtRef.current.innerHTML = applySearchHighlights(base, searchTerm);

    const hits = fmtRef.current.querySelectorAll<HTMLElement>('.search-hit');
    hits.forEach((el, i) => el.classList.toggle('search-hit-active', i === matchIndex));
    if (hits[matchIndex]) {
      hits[matchIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [formatted, searchTerm, matchIndex, editMode]);

  function enterEditMode() {
    // Populate the edit textarea with the current plain-text formatted content
    const plain = fmtRef.current?.innerText ?? '';
    setEditText(plain);
    setEditMode(true);
  }

  function exitEditMode() {
    const blob = minify(editText);
    setRaw(blob);
    setEditMode(false);
    if (blob) recordAnalysis();
  }

  function navigate(dir: 1 | -1) {
    if (matchCount === 0) return;
    setMatchIndex((i) => (i + dir + matchCount) % matchCount);
  }

  function handleRawChange(value: string) {
    setRaw(value.replace(/\n/g, ' '));
  }

  function handleClear() {
    setRaw('');
    setFormatted('');
    setSearchTerm('');
    setEditMode(false);
    setEditText('');
  }

  function handleExample() {
    setRaw(minify(JINJA_EXAMPLE));
    setEditMode(false);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Jinja / Jinja2 Formatter
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Paste a minified blob → readable, syntax-highlighted output · supports MoEngage Jinja2
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-ghost" onClick={handleExample}>
            <FileCode size={14} /> Load example
          </button>
          <button className="btn-ghost btn-danger" onClick={handleClear}>
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          flexShrink: 0,
        }}
      >
        <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Search in formatted output…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate(e.shiftKey ? -1 : 1);
            if (e.key === 'Escape') setSearchTerm('');
          }}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '13px',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
          }}
        />
        {searchTerm && (
          <>
            <span
              style={{
                fontSize: '11px',
                color: matchCount > 0 ? 'var(--text-muted)' : '#dc2626',
                flexShrink: 0,
                minWidth: '60px',
                textAlign: 'right',
              }}
            >
              {matchCount > 0 ? `${matchIndex + 1} / ${matchCount}` : 'no matches'}
            </span>
            <button className="icon-btn" onClick={() => navigate(-1)} title="Previous (Shift+Enter)">
              <ChevronUp size={12} />
            </button>
            <button className="icon-btn" onClick={() => navigate(1)} title="Next (Enter)">
              <ChevronDown size={12} />
            </button>
            <button className="icon-btn" onClick={() => setSearchTerm('')} title="Clear search">
              <X size={12} />
            </button>
          </>
        )}
      </div>

      {/* Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr', gap: '12px', flex: 1, minHeight: 0 }}>

        {/* Raw — single-line blob */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
          <div className="panel-header">
            <span>Raw / Blob</span>
            <span className="badge">{raw.length} chars</span>
          </div>
          <textarea
            className="mono code-area"
            value={raw}
            onChange={(e) => handleRawChange(e.target.value)}
            onPaste={() => setTimeout(recordAnalysis, 0)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
            placeholder="Paste your single-line Jinja blob here..."
            spellCheck={false}
            style={{
              flex: 1,
              resize: 'none',
              whiteSpace: 'nowrap',
              overflowX: 'auto',
              overflowY: 'hidden',
              minHeight: 0,
            }}
          />
          <div className="panel-footer">
            Single-line blob only · formats automatically
          </div>
        </div>

        {/* Formatted — syntax-highlighted display or plain-text edit mode */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
          <div className="panel-header">
            <span>Formatted</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {fmtLines > 0 && !editMode && <span className="badge">{fmtLines} lines</span>}
              {editMode && <span className="badge" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>editing</span>}
              <button
                className="icon-btn"
                onClick={editMode ? exitEditMode : enterEditMode}
                disabled={!formatted && !editMode}
                title={editMode ? 'Save & sync to raw' : 'Edit formatted output'}
              >
                {editMode ? <Check size={13} /> : <Pencil size={13} />}
              </button>
              <button
                className="icon-btn"
                onClick={handleCopy}
                disabled={!formatted || editMode}
                title="Copy formatted"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {editMode ? (
            <textarea
              className="mono code-area"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={exitEditMode}
              autoFocus
              spellCheck={false}
              style={{ flex: 1, resize: 'none', minHeight: 0 }}
            />
          ) : (
            <div
              ref={fmtRef}
              className="mono code-area formatted-pane"
              style={{ flex: 1, overflow: 'auto', padding: '12px', minHeight: 0 }}
            />
          )}

          <div className="panel-footer">
            {editMode
              ? 'Editing plain text — click ✓ or blur to sync back to raw blob'
              : formatted
                ? 'Click ✎ to edit · changes sync back to raw'
                : 'Waiting for input'}
          </div>
        </div>

      </div>
    </div>
  );
}
