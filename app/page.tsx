'use client';

import { useState } from 'react';
import { FileCode } from 'lucide-react';
import Sidebar, { Tool } from '@/app/components/Sidebar';
import Topbar from '@/app/components/Topbar';
import Footer from '@/app/components/Footer';
import JinjaFormatter from '@/app/components/tools/JinjaFormatter';

const TOOLS: Tool[] = [
  {
    id: 'jinja-formatter',
    label: 'Jinja / Jinja2 Formatter',
    icon: <FileCode size={15} />,
    badge: 'new',
  },
];

const TOOL_COMPONENTS: Record<string, React.ReactNode> = {
  'jinja-formatter': <JinjaFormatter />,
};

export default function Home() {
  const [activeTool, setActiveTool] = useState('jinja-formatter');
  const activeLabel = TOOLS.find((t) => t.id === activeTool)?.label ?? '';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar tools={TOOLS} activeTool={activeTool} onSelect={setActiveTool} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Topbar toolLabel={activeLabel} />

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '20px', minHeight: 0 }}>
          {TOOL_COMPONENTS[activeTool]}
        </main>

        <Footer />
      </div>
    </div>
  );
}
