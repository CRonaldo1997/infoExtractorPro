'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Layers, ListTodo, Settings2, Settings, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { User } from '@supabase/supabase-js';

const navItems = [
  { name: '任务列表', href: '/', icon: ListTodo },
  { name: '提示词组', href: '/prompts', icon: Settings2 },
  { name: '系统设置', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // 获取当前用户
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success('已退出登录');
      router.push('/login');
      router.refresh();
    } catch {
      toast.error('退出失败，请重试');
    } finally {
      setIsLoggingOut(false);
    }
  };

  // 从 email 中提取用户名 (格式: username@infoex.local)
  const displayName = user?.user_metadata?.username
    || user?.email?.replace('@infoex.local', '')
    || '用户';

  // 生成头像 seed
  const avatarSeed = displayName || 'default';

  return (
    <aside className="w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col h-full">
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-sm">
          <Layers className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">InfoEx</h1>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors relative ${isActive
                  ? 'text-primary font-semibold bg-primary/10'
                  : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-slate-500'}`} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 mt-auto border-t border-slate-200">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors">
          <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
            <img
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate text-slate-800">{displayName}</p>
            <p className="text-xs text-slate-400 truncate">已登录</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            title="退出登录"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {isLoggingOut ? (
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
