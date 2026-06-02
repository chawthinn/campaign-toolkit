'use client';

import { useState, useRef, useEffect } from 'react';
import { Copy, Trash2, FileCode, Check } from 'lucide-react';
import { formatJinja, JINJA_EXAMPLE } from '@/app/lib/jinja-formatter';
import { recordAnalysis } from '@/app/lib/stats';

// Collapse formatted multi-line back to a single-line blob
function minify(text: string): string {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
}

export default function JinjaFormatter() {
  const [raw, setRaw] = useState('');
  const [formatted, setFormatted] = useState('');
  const [copied, setCopied] = useState(false);
  const [editingFormatted, setEditingFormatted] = useState(false);
  const fmtRef = useRef<HTMLDivElement>(null);

  // Auto-format raw → formatted (debounced, skipped while user edits formatted panel)
  useEffect(() => {
    if (editingFormatted) return;
    const timer = setTimeout(() => {
      setFormatted(raw.trim() ? formatJinja(raw) : '');
    }, 150);
    return () => clearTimeout(timer);
  }, [raw, editingFormatted]);

  // Imperatively update the formatted div's HTML to avoid cursor resets mid-edit
  useEffect(() => {
    if (!fmtRef.current || editingFormatted) return;
    fmtRef.current.innerHTML = formatted
      || '<span style="color:var(--text-muted)">Formatted output will appear here...</span>';
  }, [formatted, editingFormatted]);

  // On blur: minify the formatted content back to a single-line raw blob
  function handleFormattedBlur() {
    const text = fmtRef.current?.innerText?.trim() ?? '';
    const blob = minify(text);
    setRaw(blob);
    setEditingFormatted(false);
    if (blob) recordAnalysis();
  }

  function handleRawChange(value: string) {
    // Strip any newlines — raw is always a single-line blob
    setRaw(value.replace(/\n/g, ' '));
  }

  function handleClear() {
    setRaw('');
    setFormatted('');
  }

  function handleExample() {
    // JINJA_EXAMPLE may be multi-line for readability; minify it so raw stays one line
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Jinja Formatter
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Paste a minified blob → get readable, syntax-highlighted output
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-ghost" onClick={handleExample}>
            <FileCode size={14} />
            Load example
          </button>
          <button className="btn-ghost btn-danger" onClick={handleClear}>
            <Trash2 size={14} />
            Clear
          </button>
        </div>
      </div>

      {/* Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', flex: 1, minHeight: 0 }}>
        {/* Raw — single-line blob input */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
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
            style={{ flex: 1, resize: 'none', whiteSpace: 'nowrap', overflowX: 'auto', overflowY: 'hidden' }}
          />
          <div className="panel-footer">
            <span>Single-line blob only · formats automatically</span>
          </div>
        </div>

        {/* Formatted — editable, syncs back to raw as a minified blob on blur */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <span>Formatted</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {fmtLines > 0 && <span className="badge">{fmtLines} lines</span>}
              <button
                className="icon-btn"
                onClick={handleCopy}
                disabled={!formatted}
                title="Copy formatted"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>
          <div
            ref={fmtRef}
            contentEditable
            suppressContentEditableWarning
            className="mono code-area formatted-pane"
            style={{ flex: 1, overflow: 'auto', padding: '12px', outline: 'none' }}
            onFocus={() => setEditingFormatted(true)}
            onBlur={handleFormattedBlur}
          />
          <div className="panel-footer">
            {formatted ? 'Edit here → raw updates as minified blob on blur' : 'Waiting for input'}
          </div>
        </div>
      </div>
    </div>
  );
}
