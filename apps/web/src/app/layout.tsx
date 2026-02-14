import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Inkwell',
  description: 'AI-powered word processor built with Claude',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
