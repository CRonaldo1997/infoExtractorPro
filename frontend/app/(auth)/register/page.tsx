'use client';

import { Shield, User, Lock, EyeOff, Eye, UserPlus, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export default function Register() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{
    username?: string;
    password?: string;
    confirmPassword?: string;
    general?: string;
  }>({});

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!username.trim()) {
      newErrors.username = '请输入用户名';
    } else if (username.trim().length < 2) {
      newErrors.username = '用户名至少需要2个字符';
    }
    if (!password) {
      newErrors.password = '请输入密码';
    }
    if (!confirmPassword) {
      newErrors.confirmPassword = '请再次输入密码';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = '两次输入的密码不一致';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    setErrors({});

    try {
      const supabase = createClient();
      // 使用 username@infoex.local 格式的 email 来绕过 Supabase 必须使用 email 登录的限制
      const email = `${username.trim()}@infoex.local`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username.trim(),
            display_name: username.trim(),
          },
        },
      });

      if (error) {
        if (error.message.includes('already registered') || error.message.includes('User already registered')) {
          setErrors({ general: '该用户名已被注册，请换一个用户名' });
        } else {
          setErrors({ general: error.message });
        }
        return;
      }

      if (data.user) {
        toast.success('注册成功！正在跳转...');
        router.push('/');
        router.refresh();
      }
    } catch {
      setErrors({ general: '注册失败，请检查网络连接' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-4 bg-background-light">
      <div className="w-full space-y-8 bg-white rounded-xl shadow-sm border border-slate-200 max-w-[520px] p-10">
        <header className="flex flex-col items-center text-center space-y-4">
          <img src="/logo.png" alt="Company Logo" className="h-24 w-auto object-contain" />
          <div className="space-y-1">
            <h1 className="font-black tracking-tight text-slate-800 text-3xl">智能信息提取系统</h1>
            <p className="text-slate-600 text-lg font-bold">创建账户</p>
            <p className="text-slate-400 text-xs mt-1">填写以下信息以注册新账户</p>
          </div>
        </header>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {errors.general && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 font-medium">
              {errors.general}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 ml-1">用户名</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                <User className="w-5 h-5" />
              </div>
              <input
                id="register-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`block w-full pl-11 pr-4 bg-slate-50 border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400 text-slate-900 py-4 ${errors.username ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                placeholder="请输入您的用户名"
                disabled={isLoading}
                autoComplete="username"
              />
            </div>
            {errors.username && <p className="text-red-500 text-xs ml-1">{errors.username}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 ml-1">密码</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                <Lock className="w-5 h-5" />
              </div>
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`block w-full pl-11 pr-12 bg-slate-50 border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400 text-slate-900 py-4 ${errors.password ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                placeholder="请输入您的密码"
                disabled={isLoading}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </button>
            </div>
            {errors.password && <p className="text-red-500 text-xs ml-1">{errors.password}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 ml-1">确认密码</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                <Lock className="w-5 h-5" />
              </div>
              <input
                id="register-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`block w-full pl-11 pr-12 bg-slate-50 border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400 text-slate-900 py-4 ${errors.confirmPassword ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                placeholder="请再次输入您的密码"
                disabled={isLoading}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showConfirmPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-red-500 text-xs ml-1">{errors.confirmPassword}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 py-5 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>注册账户</span>
                <UserPlus className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-4 text-slate-400">或</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/login" className="flex items-center justify-between w-full p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors group">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/5 text-primary">
                <User className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-900">返回登录</p>
                <p className="text-xs text-slate-500">已有账户？点击登录</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <footer className="text-center pt-8">
          <p className="text-xs text-slate-400">© 2026 智能信息提取系统 All Rights Reserved</p>
        </footer>
      </div>
    </div>
  );
}
