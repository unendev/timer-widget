import React, { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setError('');

    try {
      // 在独立客户端中，我们需要指定 API 基础路径
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl: '/#/timer',
      });

      if (result?.error) {
        setError('邮箱或密码错误');
      } else {
        window.location.href = '/#/timer';
      }
    } catch (err) {
      setError('登录失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a] text-white p-6">
      <div className="text-center mb-6">
        <h1 className="text-lg font-medium text-emerald-400">Timer Widget</h1>
        <p className="text-xs text-zinc-500 mt-1">登录以同步任务</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4 flex-1">
        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full bg-zinc-900 border border-zinc-800 text-sm px-3 py-2.5 rounded-xl text-white focus:outline-none focus:border-emerald-600/50"
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-zinc-900 border border-zinc-800 text-sm px-3 py-2.5 rounded-xl text-white focus:outline-none focus:border-emerald-600/50"
          />
        </div>

        {error && (
          <div className="text-xs text-red-400 text-center py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || !email || !password}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-sm rounded-xl text-white transition-colors mt-4"
        >
          {isLoading ? '登录中...' : '登录'}
        </button>
      </form>

      <p className="text-xs text-zinc-600 text-center mt-4">
        Enter 登录
      </p>
    </div>
  );
}
