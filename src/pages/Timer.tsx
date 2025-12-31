import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import useSWR, { mutate } from 'swr';
import { Play, Pause, FileText, CheckSquare, Bot, GripVertical, Loader2 } from 'lucide-react';
import { useTimerControl, TimerTask } from '@/hooks/useTimerControl';
import { fetcher, getApiUrl } from '@/lib/api';
import { getUser } from '@/lib/auth-token';

const openCreateWindow = () => {
  console.log('[Navigation] Opening Create window');
  window.open(window.location.pathname + '#/create', '_blank');
};
const openMemoWindow = () => {
  console.log('[Navigation] Opening Memo window');
  window.open(window.location.pathname + '#/memo', '_blank');
};
const openTodoWindow = () => {
  console.log('[Navigation] Opening Todo window');
  window.open(window.location.pathname + '#/todo', '_blank');
};
const openAiWindow = () => {
  console.log('[Navigation] Opening AI window');
  window.open(window.location.pathname + '#/ai', '_blank');
};

function useDoubleTap(callback: () => void, delay = 300) {
  const lastTap = useRef(0);
  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < delay) {
      callback();
      lastTap.current = 0;
      return true;
    } else {
      lastTap.current = now;
    }
    return false;
  }, [callback, delay]);
  return {
    onDoubleClick: callback,
    onTouchEnd: (e: React.TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button,a,input,textarea,select')) return;
      if (handleTap()) e.preventDefault();
    },
  };
}

export default function TimerPage() {
  const doubleTapCreate = useDoubleTap(openCreateWindow);
  const [isBlurred, setIsBlurred] = useState(false);
  
  const user = getUser();
  const userId = user?.id;
  
  // 恢复日期过滤，只显示今天的任务（保持界面简洁）
  const today = new Date().toISOString().split('T')[0];
  const apiUrl = userId ? `/api/timer-tasks?userId=${userId}&date=${today}` : null;

  const { data: tasks = [], mutate: mutateTasks } = useSWR<TimerTask[]>(
    apiUrl,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: false, dedupingInterval: 2000 }
  );

  // 递归查找所有运行中的任务（包括子任务）
  const findAllRunningTasks = useCallback((taskList: TimerTask[]): TimerTask[] => {
    const running: TimerTask[] = [];
    for (const task of taskList) {
      if (task.isRunning && !task.isPaused) {
        running.push(task);
      }
      if (task.children && task.children.length > 0) {
        running.push(...findAllRunningTasks(task.children));
      }
    }
    return running;
  }, []);

  // 递归停止任务状态
  const stopTasksRecursive = useCallback((taskList: TimerTask[]): TimerTask[] => {
    return taskList.map(task => {
      const updatedChildren = task.children ? stopTasksRecursive(task.children) : [];
      if (task.isRunning) {
        return { ...task, isRunning: false, startTime: null, children: updatedChildren };
      }
      return { ...task, children: updatedChildren };
    });
  }, []);
  
  const handleStartTask = useCallback(async (taskData: any) => {
    console.log('[Timer] Processing start-task:', taskData.name);
    
    // 1. 本地乐观更新 (Optimistic UI)
    const now = Math.floor(Date.now() / 1000);
    const optimisticTask: TimerTask = {
      id: `temp-${Date.now()}`,
      name: taskData.name,
      categoryPath: taskData.categoryPath || '未分类',
      instanceTag: typeof taskData.instanceTagNames === 'string' ? taskData.instanceTagNames : '',
      initialTime: taskData.initialTime || 0,
      elapsedTime: taskData.initialTime || 0,
      isRunning: true,
      startTime: now,
      isPaused: false,
      pausedTime: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      children: [],
      parentId: taskData.parentId || null, // Added parentId
    };

    // 立即更新 UI，让用户感觉到“秒开”
    await mutateTasks((currentTasks) => {
      const current = currentTasks || [];
      // 递归停止所有正在运行的任务
      const stoppedTasks = stopTasksRecursive(current);
      return [optimisticTask, ...stoppedTasks];
    }, false);

    // 2. 备份到 LocalStorage (容错)
    localStorage.setItem('widget-pending-task', JSON.stringify(taskData));

    try {
      // 3. 后台同步
      // 使用递归查找确保找到所有层级的运行任务
      const runningTasks = findAllRunningTasks(tasks);
      
      if (runningTasks.length > 0) {
        await Promise.all(runningTasks.map(task =>
          fetch(getApiUrl('/api/timer-tasks'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              id: task.id,
              isRunning: false,
              startTime: null,
              elapsedTime: task.elapsedTime + (task.startTime ? now - task.startTime : 0),
            }),
          })
        ));
      }
      
      const createBody = {
        name: taskData.name,
        userId: taskData.userId,
        categoryPath: taskData.categoryPath,
        date: taskData.date,
        initialTime: taskData.initialTime,
        elapsedTime: taskData.initialTime,
        instanceTagNames: typeof taskData.instanceTagNames === 'string' 
          ? taskData.instanceTagNames.split(',').map((t: string) => t.trim()).filter((t: string) => t)
          : (Array.isArray(taskData.instanceTagNames) ? taskData.instanceTagNames : []),
        isRunning: true,
        startTime: now,
        parentId: taskData.parentId || null, // Added parentId
      };
      
      const createResponse = await fetch(getApiUrl('/api/timer-tasks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(createBody),
      });
      
      if (!createResponse.ok) {
        throw new Error(await createResponse.text());
      } else {
         console.log('[Timer] Task created successfully');
         localStorage.removeItem('widget-pending-task'); // 同步成功，移除备份
         mutateTasks(); // 重新验证，获取真实 ID
      }
    } catch (err) {
      console.error('[Timer] Error processing start-task:', err);
      // 注意：出错时不移除 widget-pending-task，保留以供重试
      // 这里的乐观状态会被 SWR 的下一次自动验证冲掉，变回原样（符合预期，提示失败）
      // 但数据留在了 LocalStorage
    }
  }, [tasks, mutateTasks]);

  // 启动时检查是否有未完成的任务 (Retry Pending Task)
  useEffect(() => {
    const pendingTask = localStorage.getItem('widget-pending-task');
    if (pendingTask) {
      try {
        console.log('[Timer] Found pending task, retrying...');
        const taskData = JSON.parse(pendingTask);
        // 稍微延迟，避免和 SWR 初始化冲突
        setTimeout(() => handleStartTask(taskData), 1000);
      } catch (e) {
        localStorage.removeItem('widget-pending-task');
      }
    }
  }, []); // Run once on mount

  useEffect(() => {
    // 1. IPC Listener (Preferred)
    let unsubscribe: (() => void) | undefined;
    if (window.electron) {
      console.log('[Timer] Subscribing to IPC on-start-task');
      unsubscribe = window.electron.receive('on-start-task', (taskData) => {
        handleStartTask(taskData);
      });
    }

    // 2. Storage Event (Fallback)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'widget-pending-task' && e.newValue) {
        try {
          const taskData = JSON.parse(e.newValue);
          // 只有当这是新产生的任务（且我们还没处理）时才处理
          // 这里的逻辑比较简单，只要有变化就尝试处理
          handleStartTask(taskData);
        } catch (err) {
          console.error('[Timer] Storage parse error:', err);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (unsubscribe) unsubscribe();
    };
  }, [handleStartTask]);

  const { startTimer, pauseTimer } = useTimerControl({
    tasks,
    onTasksChange: (newTasks) => { if (apiUrl) mutate(apiUrl, newTasks, false); },
    onVersionConflict: () => mutateTasks(),
  });

  const activeTask = useMemo(() => {
    const findActive = (list: TimerTask[]): TimerTask | null => {
      for (const task of list) {
        if (task.isRunning) return task;
        if (task.children) {
          const found = findActive(task.children);
          if (found) return found;
        }
      }
      return null;
    };
    return findActive(tasks);
  }, [tasks]);

  const recentTasks = useMemo(() => {
    const topLevelTasks = tasks.filter((t) => !t.parentId);
    return topLevelTasks
      .filter((t) => t.id !== activeTask?.id)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [tasks, activeTask]);

  const [displayTime, setDisplayTime] = useState(0);
  useEffect(() => {
    if (!activeTask) { setDisplayTime(0); return; }
    const calculateTime = () => {
      if (activeTask.startTime) {
        const now = Math.floor(Date.now() / 1000);
        return activeTask.elapsedTime + (now - activeTask.startTime);
      }
      return activeTask.elapsedTime;
    };
    setDisplayTime(calculateTime());
    const interval = setInterval(() => setDisplayTime(calculateTime()), 1000);
    return () => clearInterval(interval);
  }, [activeTask]);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-[#1a1a1a] text-zinc-400 gap-3 p-4">
        <span className="text-sm">请先登录</span>
        <Link 
          to="/login" 
          className="text-sm text-emerald-400 hover:text-emerald-300 underline"
          onClick={() => console.log('[Navigation] Clicking login link')}
        >
          点击登录
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#1a1a1a] text-white select-none overflow-hidden flex">
      <div className="w-10 h-full bg-[#141414] border-r border-zinc-800 flex flex-col z-10 relative shrink-0">
        <button onClick={openMemoWindow} className="h-1/3 w-full flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors border-b border-zinc-800" title="备忘录">
          <FileText size={18} />
        </button>
        <button onClick={openTodoWindow} className="h-1/3 w-full flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors border-b border-zinc-800" title="待办事项">
          <CheckSquare size={18} />
        </button>
        <button onClick={openAiWindow} className="h-1/3 w-full flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="AI 助手">
          <Bot size={18} />
        </button>
      </div>

      <div className="flex-1 h-full flex flex-col overflow-hidden relative">
        <div className="shrink-0 p-3 pb-2 flex items-center gap-3">
          {activeTask ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); activeTask.isPaused ? startTimer(activeTask.id) : pauseTimer(activeTask.id); }}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 ${activeTask.isPaused ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400' : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400'}`}
                title={activeTask.isPaused ? "开始" : "暂停"}
                data-drag="false"
              >
                {activeTask.isPaused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
              </button>
              <div 
                className={`flex-1 min-w-0 cursor-pointer transition-all ${activeTask.isPaused ? 'text-yellow-400' : 'text-emerald-400'}`}
                onClick={() => setIsBlurred(!isBlurred)}
                {...doubleTapCreate}
                title="单击模糊 / 双击新建"
                data-drag="false"
              >
                <div className={`transition-all ${isBlurred ? 'blur-md' : ''}`}>
                  <div className="font-mono text-2xl font-bold">{formatTime(displayTime)}</div>
                  <div className={`text-xs truncate ${activeTask.isPaused ? 'text-yellow-300/70' : 'text-emerald-300/70'}`}>
                    {activeTask.name}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 shrink-0" data-drag="false">
                <Play size={18} />
              </div>
              <div 
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => setIsBlurred(!isBlurred)}
                {...doubleTapCreate}
                title="单击模糊 / 双击新建"
                data-drag="false"
              >
                 <div className={`transition-all ${isBlurred ? 'blur-md' : ''}`}>
                  <div className="font-mono text-2xl font-bold text-zinc-600">00:00:00</div>
                  <div className="text-xs text-zinc-600">双击新建任务</div>
                </div>
              </div>
            </>
          )}
          <div className="shrink-0 w-6 h-10 flex items-center justify-center cursor-move text-zinc-700 hover:text-zinc-500 transition-colors" data-drag="true" title="拖拽">
            <GripVertical size={16} />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="grid grid-cols-2 gap-2">
            {recentTasks.map((task) => (
              <button
                key={task.id}
                onClick={(e) => { e.stopPropagation(); startTimer(task.id); }}
                className="flex items-center gap-2 p-2 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg transition-colors text-left group relative"
                data-drag="false"
              >
                <Play size={12} className="text-zinc-500 shrink-0 group-hover:text-emerald-400 transition-colors" fill="currentColor" />
                <span className={`text-xs text-zinc-300 truncate transition-all ${isBlurred ? 'blur-sm' : ''}`}>
                  {task.name}
                </span>
              </button>
            ))}
          </div>
          {recentTasks.length === 0 && !activeTask && (
            <div className="text-center text-zinc-600 text-sm py-4">暂无任务</div>
          )}
        </div>
      </div>
    </div>
  );
}
