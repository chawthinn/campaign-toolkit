import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/app/context/ThemeContext';

export const metadata: Metadata = {
  title: 'campaign-toolkit',
  description: 'A marketer\'s toolkit — Jinja / Jinja2 formatter, UTM builder, and more. Built for MoEngage campaigns.',
  openGraph: {
    title: 'campaign-toolkit',
    description: 'Jinja / Jinja2 formatter, UTM builder, and more. Built for MoEngage campaigns.',
    siteName: 'campaign-toolkit',
    type: 'website',
    images: [{ url: '/og-thumbnail.png', width: 1200, height: 630, alt: 'campaign-toolkit' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'campaign-toolkit',
    description: 'Jinja / Jinja2 formatter, UTM builder, and more. Built for MoEngage campaigns.',
    images: ['/og-thumbnail.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
