import type { Metadata } from 'next';

import "./globals.css"

export const metadata: Metadata = {
  title: 'Clark',
  description: 'Applicant Tracking System integrated with Linear',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
