'use client';

import { useState, useRef, useEffect } from 'react';
import { Copy, Trash2, FileCode, Check } from 'lucide-react';
import { formatJinja, JINJA_EXAMPLE } from '@/app/lib/jinja-formatter';
import { recordAnalysis } from '@/app/lib/stats';

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

  // Imperatively update the formatted div's HTML so we never reset the cursor mid-edit
  useEffect(() => {
    if (!fmtRef.current || editingFormatted) return;
    fmtRef.current.innerHTML = formatted
      || '<span style="color:var(--text-muted)">Formatted output will appear here...</span>';
  }, [formatted, editingFormatted]);

  // Formatted panel edited → push plain text back to raw
  function handleFormattedInput() {
    if (!fmtRef.current) return;
    setRaw(fmtRef.current.innerText);
  }

  // On blur: re-apply syntax highlighting and record the analysis
  function handleFormattedBlur() {
    const text = fmtRef.current?.innerText?.trim() ?? '';
    setRaw(text);
    setEditingFormatted(false); // triggers effects above to re-highlight
    if (text) recordAnalysis();
  }

  function handleClear() {
    setRaw('');
    setFormatted('');
  }

  function handleExample() {
    setRaw(JINJA_EXAMPLE);
    recordAnalysis();
  }

  async function handleCopy() {
    const text = fmtRef.current?.innerText ?? '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const rawLines = raw ? raw.split('\n').length : 0;
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
            Paste in either panel — both stay in sync automatically
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
        {/* Raw */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <span>Raw / Blob</span>
            <span className="badge">{rawLines} lines · {raw.length} chars</span>
          </div>
          <textarea
            className="mono code-area"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onPaste={() => setTimeout(recordAnalysis, 0)}
            placeholder="Paste your Jinja template blob here..."
            spellCheck={false}
            style={{ flex: 1, resize: 'none' }}
          />
          <div className="panel-footer">
            <span>Edits sync to formatted automatically</span>
          </div>
        </div>

        {/* Formatted */}
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
            onInput={handleFormattedInput}
            onBlur={handleFormattedBlur}
          />
          <div className="panel-footer">
            {formatted ? 'Edits sync to raw automatically' : 'Waiting for input'}
          </div>
        </div>
      </div>
    </div>
  );
}
