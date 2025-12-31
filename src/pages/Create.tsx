import React from 'react';
import useSWR from 'swr';
import CreateLogFormWithCards from '@/components/features/log/CreateLogFormWithCards';
import { fetcher } from '@/lib/api';
import { getUser } from '@/lib/auth-token';

interface SessionUser {
  id: string;
  email?: string;
}

export default function CreatePage() {
  // 优先从本地读取用户信息（支持离线/弱网）
  const localUser = getUser();
  
  const { data: sessionData, isLoading } = useSWR<{ user?: SessionUser }>(
    '/api/auth/session',
    fetcher,
    { revalidateOnFocus: false }
  );
  
  // 如果 API 还没返回，优先使用本地缓存的 User ID
  const userId = sessionData?.user?.id || localUser?.id;
  const today = new Date().toISOString().split('T')[0];

  const handleAddToTimer = async (
    taskName: string,
    categoryPath: string,
    date: string,
    initialTime?: number,
    instanceTagNames?: string
  ) => {
    // 即使没有 userId，也允许先创建（后续可以由主进程处理或提示）
    // 但为了数据完整性，暂且要求有 userId（本地缓存的也行）
    if (!userId) return;
    
    const taskData = {
      name: taskName,
      userId,
      categoryPath: categoryPath || '未分类',
      date: date || today,
      initialTime: initialTime || 0,
      instanceTagNames: instanceTagNames || '',
      timestamp: Date.now(),
    };
    
    console.log('[Create Page] Sending start-task via IPC:', taskName);
    
    // 优先通过 IPC 发送数据给主进程转发
    if (window.electron) {
      window.electron.send('start-task', taskData);
    } else {
      // 备选：保留 localStorage 方式
      localStorage.setItem('widget-pending-task', JSON.stringify(taskData));
    }
    
    // 延迟关闭，确保数据发出
    setTimeout(() => window.close(), 100);
  };

  // 如果本地有用户，就不显示 Loading，直接渲染界面
  if (isLoading && !userId) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-900">
        <span className="text-sm text-emerald-400 font-medium">正在准备...</span>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-900 text-emerald-400">
        <span className="text-sm">请先登录</span>
      </div>
    );
  }

  return (
    <div className="h-screen text-white overflow-y-auto bg-zinc-900 relative custom-scrollbar">
      <button
        onClick={() => window.close()}
        className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-800 hover:bg-red-500 flex items-center justify-center text-zinc-400 hover:text-white transition-all z-40"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      
      <div className="p-6 pt-10">
        <CreateLogFormWithCards
          onAddToTimer={handleAddToTimer}
          selectedDate={today}
          userId={userId}
        />
      </div>
    </div>
  );
}
