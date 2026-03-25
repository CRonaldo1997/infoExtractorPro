'use client';

import { Search, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export function Header({ 
  title, 
  searchPlaceholder = "搜索任务...",
  backLink
}: { 
  title: string;
  searchPlaceholder?: string;
  backLink?: string;
}) {
  return (
    <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center justify-between px-8 z-10 flex-shrink-0">
      <div className="flex items-center gap-4">
        {backLink && (
          <Link href={backLink} className="p-2 -ml-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        )}
        <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative group">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none w-64 text-sm transition-all"
          />
        </div>
      </div>
    </header>
  );
}
