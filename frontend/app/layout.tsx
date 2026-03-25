import type { Metadata } from 'next';
import { Public_Sans } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';

const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: '智能信息提取系统',
  description: '基于LLM和OCR的信息抽取系统',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${publicSans.variable} font-sans`} suppressHydrationWarning>
      <body className="bg-background-light text-slate-900 antialiased min-h-screen flex flex-col" suppressHydrationWarning>
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
