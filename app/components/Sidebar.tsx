'use client';

import { useState } from 'react';
import { Code2, ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/app/context/ThemeContext';

export interface Tool {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

interface SidebarProps {
  tools: Tool[];
  activeTool: string;
  onSelect: (id: string) => void;
}

export default function Sidebar({ tools, activeTool, onSelect }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(true);
  const { theme, toggle } = useTheme();

  return (
    <aside
      style={{
        width: collapsed ? '52px' : '200px',
        minWidth: collapsed ? '52px' : '200px',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Logo area */}
      <div
        style={{
          padding: collapsed ? '12px 0' : '12px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: collapsed ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: collapsed ? '8px' : '6px',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              background: 'var(--accent)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Code2 size={13} color="#fff" />
          </div>
          {!collapsed && (
            <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              campaign-toolkit
            </span>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            flexShrink: 0,
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
        >
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {!collapsed && (
          <div
            style={{
              padding: '4px 12px 8px',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Tools
          </div>
        )}
        {tools.map((tool) => {
          const active = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => onSelect(tool.id)}
              title={collapsed ? tool.label : undefined}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: collapsed ? '10px 0' : '9px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: active ? 'var(--bg-active)' : 'transparent',
                border: 'none',
                borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                borderRight: 'none',
                cursor: 'pointer',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: active ? 600 : 400,
                transition: 'background 0.12s, color 0.12s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <span style={{ flexShrink: 0, display: 'flex' }}>{tool.icon}</span>
              {!collapsed && (
                <>
                  <span style={{ flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tool.label}</span>
                  {tool.badge && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: '9px',
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: '99px',
                        background: 'var(--accent-bg)',
                        color: 'var(--accent)',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {tool.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '7px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '12px',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={14} /> : (
            <>
              <ChevronLeft size={14} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
