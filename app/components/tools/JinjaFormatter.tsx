'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Copy, Trash2, FileCode, Check, Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatJinja, JINJA_EXAMPLE } from '@/app/lib/jinja-formatter';
import { recordAnalysis } from '@/app/lib/stats';

function minify(text: string): string {
  return text.split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
}

// activeIndex = which hit gets the orange "current match" style; -1 = none
function applySearchHighlights(html: string, term: string, activeIndex = -1): string {
  if (!term.trim()) return html;
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let hitNum = 0;
  return html.replace(/(<[^>]+>|[^<]+)/g, (chunk) => {
    if (chunk.startsWith('<')) return chunk;
    return chunk.replace(new RegExp(esc, 'gi'), (m) => {
      const cls = hitNum++ === activeIndex ? 'search-hit search-hit-active' : 'search-hit';
      return `<mark class="${cls}">${m}</mark>`;
    });
  });
}

export default function JinjaFormatter() {
  const [raw, setRaw] = useState('');
  const [formatted, setFormatted] = useState('');
  const [copied, setCopied] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [rawCollapsed, setRawCollapsed] = useState(false);
  const [unsavedWarning, setUnsavedWarning] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const fmtRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const exitingRef = useRef(false);
  // Stores plain text on focus so we can detect real changes on blur
  const originalTextRef = useRef('');
  // Tracks previous search term so we can reset to match 0 in a single pass
  const prevSearchRef = useRef('');

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMouseMove(ev: MouseEvent) {
      if (!panelsRef.current) return;
      const rect = panelsRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(75, Math.max(25, pct)));
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

  // Auto-collapse header once content is present
  useEffect(() => {
    setHeaderCollapsed(!!raw.trim());
  }, [!!raw.trim()]);

  // Auto-format raw → formatted (debounced, skipped while editing)
  useEffect(() => {
    if (editMode) return;
    const timer = setTimeout(() => {
      setFormatted(raw.trim() ? formatJinja(raw) : '');
    }, 150);
    return () => clearTimeout(timer);
  }, [raw, editMode]);

  // Count search matches
  const matchCount = useMemo(() => {
    if (!searchTerm.trim() || !formatted) return 0;
    const plain = formatted.replace(/<[^>]+>/g, '');
    const esc = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (plain.match(new RegExp(esc, 'gi')) || []).length;
  }, [searchTerm, formatted]);

  // HTML for display mode — React owns this via dangerouslySetInnerHTML
  const highlightedHtml = useMemo(() => {
    const base = formatted
      || '<span style="color:var(--text-muted)">Formatted output will appear here...</span>';
    return applySearchHighlights(base, searchTerm, matchIndex);
  }, [formatted, searchTerm, matchIndex]);

  // Scroll to active match after React paints the new highlightedHtml
  useEffect(() => {
    if (editMode) return;

    const isNewSearch = searchTerm !== prevSearchRef.current;
    prevSearchRef.current = searchTerm;

    // New search → jump to first match
    if (isNewSearch && matchIndex !== 0) {
      setMatchIndex(0);
      return;
    }

    requestAnimationFrame(() => {
      const active = fmtRef.current?.querySelector<HTMLElement>('.search-hit-active');
      active?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [formatted, searchTerm, matchIndex, editMode]);

  // Triggered by clicking into the formatted panel (display mode only)
  function handleFmtFocus() {
    if (!formatted || editMode) return;
    const scrollTop = fmtRef.current?.scrollTop ?? 0;
    originalTextRef.current = fmtRef.current?.innerText ?? '';
    setUnsavedWarning(false);
    setEditMode(true);
    // After React re-renders the contentEditable div, set clean HTML (no search marks) and restore scroll
    setTimeout(() => {
      if (fmtRef.current) {
        fmtRef.current.innerHTML = formatted;
        fmtRef.current.scrollTop = scrollTop;
        fmtRef.current.focus();
      }
    }, 0);
  }

  function saveEdit() {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setTimeout(() => { exitingRef.current = false; }, 100);
    setUnsavedWarning(false);
    const text = fmtRef.current?.innerText?.trim() ?? '';
    const blob = minify(text);
    setRaw(blob);
    setEditMode(false);
    if (blob) recordAnalysis();
  }

  function discardEdit() {
    exitingRef.current = false;
    setUnsavedWarning(false);
    setEditMode(false);
    // dangerouslySetInnerHTML on the display div automatically restores content
  }

  // Blur: only warn if content actually changed; exit silently if nothing was edited
  function handleFormattedBlur() {
    if (!editMode || exitingRef.current) return;
    const currentText = fmtRef.current?.innerText ?? '';
    const hasChanges = currentText.trim() !== originalTextRef.current.trim();
    if (hasChanges) {
      setUnsavedWarning(true);
    } else {
      setEditMode(false); // silent exit — no edits made
    }
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
    setUnsavedWarning(false);
    exitingRef.current = false;
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '12px', minHeight: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <button
          onClick={() => setHeaderCollapsed((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-primary)' }}
          title={headerCollapsed ? 'Expand header' : 'Collapse header'}
        >
          <span style={{ fontSize: '16px', fontWeight: 600 }}>Jinja / Jinja2 Formatter</span>
          {headerCollapsed
            ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
            : <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />}
        </button>
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <button className="btn-ghost" onClick={handleExample}><FileCode size={14} /> Load example</button>
          <button className="btn-ghost btn-danger" onClick={handleClear}><Trash2 size={14} /> Clear</button>
        </div>
      </div>

      {!headerCollapsed && (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-4px' }}>
          Paste a minified blob → readable, syntax-highlighted output · supports MoEngage Jinja2
        </p>
      )}

      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '7px 12px',
        background: 'var(--bg-panel)',
        border: `1.5px solid ${searchFocused ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '8px',
        flexShrink: 0,
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
        <div
          className="panel"
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            flexBasis: rawCollapsed ? '28px' : `${splitPercent}%`,
            flexShrink: 0,
            flexGrow: 0,
            minWidth: 0,
            overflow: 'hidden',
            transition: 'flex-basis 0.2s ease',
          }}
        >
          {rawCollapsed ? (
            /* Collapsed strip — click to expand */
            <button
              onClick={() => setRawCollapsed(false)}
              title="Expand RAW / BLOB panel"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', width: '100%', height: '100%',
                border: 'none', background: 'transparent', cursor: 'pointer',
                gap: '10px', color: 'var(--text-muted)', padding: '12px 0',
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            >
              <ChevronRight size={13} />
              <span style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}>
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
                    onClick={() => setRawCollapsed(true)}
                    title="Collapse RAW panel"
                  >
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

        {/* Drag divider — hidden when raw is collapsed */}
        {!rawCollapsed && (
          <div
            onMouseDown={onDividerMouseDown}
            onDoubleClick={() => setSplitPercent(50)}
            title="Drag to resize · Double-click to reset"
            style={{ width: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'col-resize', zIndex: 1 }}
          >
            <div
              style={{ width: '3px', height: '36px', borderRadius: '99px', background: 'var(--border)', transition: 'background 0.15s' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--accent)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--border)')}
            />
          </div>
        )}

        {/* Formatted — same div for both display and editing */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, minWidth: 0 }}>
          <div className="panel-header">
            <span>Formatted</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {fmtLines > 0 && !editMode && <span className="badge">{fmtLines} lines</span>}

              {/* Save button — only visible while editing */}
              {editMode && (
                <button
                  className="btn-primary"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={saveEdit}
                  style={{ padding: '4px 12px', fontSize: '12px', borderRadius: '6px' }}
                >
                  <Check size={12} /> Save
                </button>
              )}

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

          {/* DISPLAY mode — React owns HTML via dangerouslySetInnerHTML; search highlights always work */}
          {!editMode && (
            <div
              ref={fmtRef}
              className="mono code-area formatted-pane"
              style={{
                flex: 1, overflow: 'auto', padding: '12px', minHeight: 0,
                outline: 'none',
                cursor: formatted ? 'text' : 'default',
                borderTop: '2px solid transparent',
              }}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
              onClick={formatted ? handleFmtFocus : undefined}
              tabIndex={formatted ? 0 : -1}
              onKeyDown={(e) => { if (e.key === 'Enter') handleFmtFocus(); }}
            />
          )}

          {/* EDIT mode — contentEditable; HTML set imperatively after mount */}
          {editMode && (
            <div
              ref={fmtRef}
              contentEditable
              suppressContentEditableWarning
              className="mono code-area formatted-pane"
              style={{
                flex: 1, overflow: 'auto', padding: '12px', minHeight: 0,
                outline: 'none', cursor: 'text',
                borderTop: '2px solid var(--accent)',
              }}
              onBlur={handleFormattedBlur}
              onPaste={(e) => {
                e.preventDefault();
                document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
              }}
            />
          )}

          {/* Unsaved changes warning */}
          {unsavedWarning && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '8px 12px',
              background: 'var(--bg-active)',
              borderTop: '1px solid #f59e0b',
            }}>
              <span style={{ fontSize: '12px', color: '#d97706', display: 'flex', alignItems: 'center', gap: '5px' }}>
                ⚠ Unsaved changes — click Save or they'll be lost
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="btn-ghost"
                  onClick={discardEdit}
                  style={{ padding: '3px 10px', fontSize: '11px' }}
                >
                  Discard
                </button>
                <button
                  className="btn-primary"
                  onClick={saveEdit}
                  style={{ padding: '3px 10px', fontSize: '11px', borderRadius: '5px' }}
                >
                  <Check size={11} /> Save
                </button>
              </div>
            </div>
          )}

          <div className="panel-footer">
            {editMode
              ? 'Syntax colours stay live while editing · click Save when done'
              : formatted ? 'Click ✎ to edit · changes sync back to raw' : 'Waiting for input'}
          </div>
        </div>

      </div>
    </div>
  );
}
