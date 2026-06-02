import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/app/context/ThemeContext';

export const metadata: Metadata = {
  title: 'campaign-toolkit',
  description: 'A marketer\'s toolkit — Jinja formatter, UTM builder, and more.',
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
