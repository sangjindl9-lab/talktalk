import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '톡톡 Talk Talk 관리자',
  description: '톡톡 Talk Talk 운영 관리자 웹',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
