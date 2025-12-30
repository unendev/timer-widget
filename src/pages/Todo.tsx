import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Square, CheckSquare, Trash2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import { fetcher, getApiUrl } from '@/lib/api';

const TODO_STORAGE_KEY = 'todo-items-v1';
const TODO_UPDATED_KEY = 'todo-updated-at';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  group: string;
  createdAt: string;
}

export default function TodoPage() {
  // State for items, initialized from localStorage
  const [localItems, setLocalItems] = useState<TodoItem[]>(() => {
    try {
      const savedItems = localStorage.getItem(TODO_STORAGE_KEY);
      return savedItems ? JSON.parse(savedItems) : [];
    } catch (error) {
      console.error("Failed to parse todo items from localStorage:", error);
      return [];
    }
  });

  const { data: serverItems = [], isLoading } = useSWR<TodoItem[]>("/api/widget/todo", fetcher, {
    onSuccess: (data) => {
      // Sync server data to local storage if newer or local is empty
      const localUpdatedAt = parseInt(localStorage.getItem(TODO_UPDATED_KEY) || "0");
      const serverUpdatedAt = data.reduce((max, item) => Math.max(max, new Date(item.createdAt).getTime()), 0);
      
      if (!localItems.length || serverUpdatedAt > localUpdatedAt) {
        console.log("Syncing todo items from server (newer version found)");
        setLocalItems(data);
        localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(data));
        localStorage.setItem(TODO_UPDATED_KEY, serverUpdatedAt.toString());
      }
    },
  });

  // Combine local and server data, giving precedence to local changes not yet synced
  // This can be a more complex merge strategy in a real app, but for now, simple merge
  const items = useMemo(() => {
    const serverItemMap = new Map(serverItems.map(item => [item.id, item]));
    return localItems.map(item => serverItemMap.has(item.id) ? serverItemMap.get(item.id)! : item);
  }, [localItems, serverItems]);

  const [inputValue, setInputValue] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["default"]));

  // 加载展开状态和显示已完成状态（这些仍保留在本地）
  useEffect(() => {
    const savedExpanded = localStorage.getItem("widget-todo-expanded-groups");
    if (savedExpanded) {
      try {
        setExpandedGroups(new Set(JSON.parse(savedExpanded)));
      } catch (e) {}
    }
    const savedShowCompleted = localStorage.getItem("widget-todo-show-completed");
    if (savedShowCompleted !== null) {
      setShowCompleted(savedShowCompleted === "true");
    }
  }, []);

  // 持久化 UI 状态
  useEffect(() => {
    localStorage.setItem("widget-todo-expanded-groups", JSON.stringify(Array.from(expandedGroups)));
  }, [expandedGroups]);

  useEffect(() => {
    localStorage.setItem("widget-todo-show-completed", String(showCompleted));
  }, [showCompleted]);

  const updateLocalAndSync = useCallback((newItems: TodoItem[]) => {
    const now = Date.now();
    setLocalItems(newItems);
    localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(newItems));
    localStorage.setItem(TODO_UPDATED_KEY, now.toString());
    mutate("/api/widget/todo", newItems, false); // Update SWR cache optimistically
  }, []);

  const handleSubmit = async () => {
    const text = inputValue.trim();
    if (!text) return;
    
    const groupName = newGroup.trim() || "default";
    
    // 乐观更新
    const newItem: TodoItem = {
      id: `temp-${Date.now()}`,
      text,
      completed: false,
      group: groupName,
      createdAt: new Date().toISOString(),
    };
    
    const newItems = [...localItems, newItem];
    updateLocalAndSync(newItems);
    setInputValue("");

    try {
      await fetch(getApiUrl("/api/widget/todo"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, group: groupName }),
      });
      mutate("/api/widget/todo"); // Revalidate with server data
      if (groupName !== "default") {
        setExpandedGroups(prev => new Set([...prev, groupName]));
      }
    } catch (err) {
      console.error("Failed to create todo:", err);
      mutate("/api/widget/todo"); // Revert or show error
    }
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    const newItems = localItems.map(item => 
      item.id === id ? { ...item, completed: !completed } : item
    );
    updateLocalAndSync(newItems);

    try {
      await fetch(getApiUrl("/api/widget/todo"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, completed: !completed }),
      });
      mutate("/api/widget/todo"); // Revalidate with server data
    } catch (err) {
      console.error("Failed to update todo:", err);
      mutate("/api/widget/todo"); // Revert or show error
    }
  };

  const deleteItem = async (id: string) => {
    const newItems = localItems.filter(item => item.id !== id);
    updateLocalAndSync(newItems);

    try {
      await fetch(getApiUrl(`/api/widget/todo?id=${id}`), {
        method: "DELETE",
      });
      mutate("/api/widget/todo"); // Revalidate with server data
    } catch (err) {
      console.error("Failed to delete todo:", err);
      mutate("/api/widget/todo"); // Revert or show error
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

  const groups = [...new Set(items.map((t: TodoItem) => t.group))];
  const activeTodos = items.filter((t: TodoItem) => !t.completed);
  const completedTodos = items.filter((t: TodoItem) => t.completed);

  const todosByGroup: Record<string, TodoItem[]> = groups.reduce((acc: Record<string, TodoItem[]>, group: string) => {
    acc[group] = activeTodos.filter((t: TodoItem) => t.group === group);
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
          if (groupTodos.length === 0 && group !== "default") return null;
          
          const isExpanded = expandedGroups.has(group);
          
          return (
            <div key={group}>
              {group !== "default" && (
                <button
                  onClick={() => toggleGroup(group)}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-300 mb-1.5 w-full"
                >
                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span className="font-medium">{group}</span>
                  <span className="text-zinc-600">({groupTodos.length})</span>
                </button>
              )}
              
              {(group === "default" || isExpanded) && (
                <div className="space-y-1.5">
                  {groupTodos.map((item: TodoItem) => (
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
                {completedTodos.map((item: TodoItem) => (
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
