import React, { useState, useEffect } from 'react';
import { X, Square, CheckSquare, Trash2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import { fetcher, getApiUrl } from '@/lib/api';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  group: string;
  createdAt: string;
}

export default function TodoPage() {
  const { data: items = [], isLoading } = useSWR<TodoItem[]>('/api/widget/todo', fetcher);
  const [inputValue, setInputValue] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['default']));

  // 加载展开状态和显示已完成状态（这些仍保留在本地）
  useEffect(() => {
    const savedExpanded = localStorage.getItem('widget-todo-expanded-groups');
    if (savedExpanded) {
      try {
        setExpandedGroups(new Set(JSON.parse(savedExpanded)));
      } catch (e) {}
    }
    const savedShowCompleted = localStorage.getItem('widget-todo-show-completed');
    if (savedShowCompleted !== null) {
      setShowCompleted(savedShowCompleted === 'true');
    }
  }, []);

  // 持久化 UI 状态
  useEffect(() => {
    localStorage.setItem('widget-todo-expanded-groups', JSON.stringify(Array.from(expandedGroups)));
  }, [expandedGroups]);

  useEffect(() => {
    localStorage.setItem('widget-todo-show-completed', String(showCompleted));
  }, [showCompleted]);

  const handleSubmit = async () => {
    const text = inputValue.trim();
    if (!text) return;
    
    const groupName = newGroup.trim() || 'default';
    
    // 乐观更新
    const newItem: TodoItem = {
      id: `temp-${Date.now()}`,
      text,
      completed: false,
      group: groupName,
      createdAt: new Date().toISOString(),
    };
    
    mutate('/api/widget/todo', [...items, newItem], false);
    setInputValue('');

    try {
      await fetch(getApiUrl('/api/widget/todo'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, group: groupName }),
      });
      mutate('/api/widget/todo');
      if (groupName !== 'default') {
        setExpandedGroups(prev => new Set([...prev, groupName]));
      }
    } catch (err) {
      console.error('Failed to create todo:', err);
      mutate('/api/widget/todo');
    }
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    // 乐观更新
    mutate('/api/widget/todo', items.map(item => 
      item.id === id ? { ...item, completed: !completed } : item
    ), false);

    try {
      await fetch(getApiUrl('/api/widget/todo'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completed: !completed }),
      });
      mutate('/api/widget/todo');
    } catch (err) {
      console.error('Failed to update todo:', err);
      mutate('/api/widget/todo');
    }
  };

  const deleteItem = async (id: string) => {
    // 乐观更新
    mutate('/api/widget/todo', items.filter(item => item.id !== id), false);

    try {
      await fetch(getApiUrl(`/api/widget/todo?id=${id}`), {
        method: 'DELETE',
      });
      mutate('/api/widget/todo');
    } catch (err) {
      console.error('Failed to delete todo:', err);
      mutate('/api/widget/todo');
    }
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const groups = [...new Set(items.map(t => t.group))];
  const activeTodos = items.filter(t => !t.completed);
  const completedTodos = items.filter(t => t.completed);

  const todosByGroup = groups.reduce((acc, group) => {
    acc[group] = activeTodos.filter(t => t.group === group);
    return acc;
  }, {} as Record<string, TodoItem[]>);

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-900 text-zinc-100 select-none overflow-hidden">
      {/* 标题栏 */}
      <div 
        className="flex items-center justify-between px-3 py-2 border-b border-zinc-700 bg-zinc-800 shrink-0"
        data-drag="true"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium text-zinc-300">待办事项</h2>
          {isLoading && <Loader2 size={10} className="animate-spin text-zinc-500" />}
        </div>
        <button
          onClick={() => window.close()}
          className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-600 transition-colors"
          data-drag="false"
        >
          <X size={12} />
        </button>
      </div>
      
      {/* 内容区域 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
        {groups.map(group => {
          const groupTodos = todosByGroup[group] || [];
          if (groupTodos.length === 0 && group !== 'default') return null;
          
          const isExpanded = expandedGroups.has(group);
          
          return (
            <div key={group}>
              {group !== 'default' && (
                <button
                  onClick={() => toggleGroup(group)}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-300 mb-1.5 w-full"
                >
                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span className="font-medium">{group}</span>
                  <span className="text-zinc-600">({groupTodos.length})</span>
                </button>
              )}
              
              {(group === 'default' || isExpanded) && (
                <div className="space-y-1.5">
                  {groupTodos.map(item => (
                    <div 
                      key={item.id} 
                      className="group flex items-start gap-2 p-2 bg-zinc-800/50 border border-zinc-700/50 rounded hover:border-zinc-600 transition-colors"
                    >
                      <button 
                        onClick={() => toggleTodo(item.id, item.completed)}
                        className="mt-0.5 text-zinc-500 hover:text-emerald-400 transition-colors"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                      <span className="flex-1 text-sm leading-relaxed text-zinc-200">{item.text}</span>
                      <button 
                        onClick={() => deleteItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        
        {activeTodos.length === 0 && !isLoading && (
          <div className="text-zinc-500 text-sm py-4 text-center">
            暂无待办
          </div>
        )}

        {/* 已完成 */}
        {completedTodos.length > 0 && (
          <div className="pt-3 border-t border-zinc-700/50">
            <button 
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-400 mb-2"
            >
              {showCompleted ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              已完成 ({completedTodos.length})
            </button>
            
            {showCompleted && (
              <div className="space-y-1 pl-2 border-l border-zinc-700/50 ml-1">
                {completedTodos.map(item => (
                  <div key={item.id} className="flex items-center gap-2 py-1 text-zinc-500 group">
                    <button onClick={() => toggleTodo(item.id, item.completed)} className="text-emerald-500/70">
                      <CheckSquare className="w-3.5 h-3.5" />
                    </button>
                    <span className="flex-1 text-xs line-through">{item.text}</span>
                    <button 
                      onClick={() => deleteItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 输入框 */}
      <div className="p-2 border-t border-zinc-700 bg-zinc-800 shrink-0">
        <div className="flex gap-1.5">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="+ 添加待办"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors placeholder:text-zinc-600"
          />
          <input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            placeholder="分组"
            className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-400 focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
        </div>
      </div>
    </div>
  );
}
