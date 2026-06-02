'use client';

import { useEffect, useState } from 'react';
import { Eye, Activity } from 'lucide-react';
import { getVisits, getAnalyses, recordVisit } from '@/app/lib/stats';

export default function Footer() {
  const [visits, setVisits] = useState(0);
  const [analyses, setAnalyses] = useState(0);

  useEffect(() => {
    recordVisit();
    setVisits(getVisits());
    setAnalyses(getAnalyses());

    function refresh() {
      setVisits(getVisits());
      setAnalyses(getAnalyses());
    }

    window.addEventListener('ct-stats-updated', refresh);
    return () => window.removeEventListener('ct-stats-updated', refresh);
  }, []);

  return (
    <footer
      style={{
        borderTop: '1px solid var(--border)',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-panel)',
        flexShrink: 0,
        fontSize: '12px',
        color: 'var(--text-muted)',
      }}
    >
      <span>
        Built by{' '}
        <strong style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Chaw Thinn</strong>
        {' '}· 2026
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Eye size={12} />
          {visits} visits
        </span>
        <span style={{ color: 'var(--border)' }}>·</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Activity size={12} />
          {analyses} analyses run
        </span>
      </div>

      <span>
        Check out my full portfolio and other projects at{' '}
        <a
          href="https://chawthinn.github.io"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'none' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.textDecoration = 'underline')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.textDecoration = 'none')}
        >
          chawthinn.github.io
        </a>
      </span>
    </footer>
  );
}
