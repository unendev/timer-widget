import React from 'react';
import useSWR from 'swr';
import { X } from 'lucide-react';
import { fetcher } from '@/lib/api';

interface SessionUser {
  id: string;
  email?: string;
  name?: string;
}

export default function SettingsPage() {
  const { data: sessionData } = useSWR<{ user?: SessionUser }>(
    '/api/auth/session',
    fetcher,
    { revalidateOnFocus: false }
  );

  return (
    <div className="flex flex-col w-full h-full bg-[#1a1a1a] text-white select-none">
      <div 
        className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-[#141414]"
        data-drag="true"
      >
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">设置</h3>
        <button
          onClick={() => window.close()}
          className="w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
          data-drag="false"
        >
          <X size={14} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div className="space-y-2">
          <h4 className="text-xs text-zinc-500 uppercase">账户</h4>
          <div className="p-3 bg-zinc-800/50 rounded-lg">
            <p className="text-sm text-zinc-300">
              {sessionData?.user?.name || sessionData?.user?.email || '未登录'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs text-zinc-500 uppercase">数据</h4>
          <button
            onClick={() => {
              localStorage.removeItem('widget-memo-content');
              localStorage.removeItem('widget-todo-items');
              alert('本地数据已清除');
            }}
            className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-300 transition-colors text-left"
          >
            清除备忘录和待办数据
          </button>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="w-full px-3 py-2 bg-red-950/50 hover:bg-red-900/50 border border-red-800/30 rounded text-xs text-red-300 transition-colors text-left"
          >
            清除所有本地数据
          </button>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs text-zinc-500 uppercase">关于</h4>
          <div className="p-3 bg-zinc-800/50 rounded-lg text-xs text-zinc-500">
            <p>Timer Widget v1.0</p>
            <p className="mt-1">Project Nexus</p>
          </div>
        </div>
      </div>
    </div>
  );
}
