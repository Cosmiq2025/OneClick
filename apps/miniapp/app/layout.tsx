import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'One-Click TL;DR',
  description: 'Minimal Farcaster Frame mini-app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif' }}>{children}</body>
    </html>
  );
}
