'use client';

import { useState, useRef } from 'react';
import { Wand2, Copy, Trash2, FileCode, Check } from 'lucide-react';
import { formatJinja, JINJA_EXAMPLE } from '@/app/lib/jinja-formatter';
import { recordAnalysis } from '@/app/lib/stats';

export default function JinjaFormatter() {
  const [raw, setRaw] = useState('');
  const [formatted, setFormatted] = useState('');
  const [copied, setCopied] = useState(false);
  const fmtRef = useRef<HTMLDivElement>(null);

  function handleFormat() {
    if (!raw.trim()) return;
    setFormatted(formatJinja(raw));
    recordAnalysis();
  }

  function handleClear() {
    setRaw('');
    setFormatted('');
  }

  function handleExample() {
    setRaw(JINJA_EXAMPLE);
    setFormatted(formatJinja(JINJA_EXAMPLE));
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
          <button className="btn-primary" onClick={handleFormat}>
            <Wand2 size={14} />
            Format
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
            placeholder="Paste your Jinja template blob here..."
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleFormat();
            }}
            style={{ flex: 1, resize: 'none' }}
          />
          <div className="panel-footer">
            <span>⌘ + Enter to format</span>
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
            className="mono code-area formatted-pane"
            style={{ flex: 1, overflow: 'auto', padding: '12px' }}
            dangerouslySetInnerHTML={{
              __html: formatted || '<span style="color:var(--text-muted)">Formatted output will appear here...</span>',
            }}
          />
          <div className="panel-footer">
            {formatted ? 'Ready to copy' : 'Waiting for input'}
          </div>
        </div>
      </div>
    </div>
  );
}
