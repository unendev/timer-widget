import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import { MarkdownView } from '@/components/shared/MarkdownView';
import { fetcher } from '@/lib/api';
import { fetchWithRetry } from '@/lib/fetch-utils';

const MEMO_STORAGE_KEY = 'memo-content-v1';
const MEMO_UPDATED_KEY = 'memo-updated-at';

interface MemoData {
  id: string;
  content: string;
  updatedAt: string;
}

export default function MemoPage() {
  const { data: memo, isLoading } = useSWR<MemoData>('/api/widget/memo', fetcher);
  const [content, setContent] = useState(() => {
    return localStorage.getItem(MEMO_STORAGE_KEY) || '';
  });
  const [isEditing, setIsEditing] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 当从服务器加载到数据时同步到本地状态
  useEffect(() => {
    if (memo) {
      const localContent = localStorage.getItem(MEMO_STORAGE_KEY);
      const localTime = parseInt(localStorage.getItem(MEMO_UPDATED_KEY) || '0');
      const serverTime = new Date(memo.updatedAt).getTime();

      // 1. 如果本地为空，直接使用云端数据
      if (!localContent) {
        setContent(memo.content);
        localStorage.setItem(MEMO_STORAGE_KEY, memo.content);
        localStorage.setItem(MEMO_UPDATED_KEY, serverTime.toString());
        return;
      }

      // 2. 如果内容一致，不需要更新（更新时间戳以保持同步）
      if (localContent === memo.content) {
        if (serverTime > localTime) {
          localStorage.setItem(MEMO_UPDATED_KEY, serverTime.toString());
        }
        return;
      }

      // 3. 如果云端更新且时间比本地晚（且用户当前未在编辑），则更新本地
      if (serverTime > localTime && !isEditing) {
        console.log('Syncing from server (newer version found)');
        setContent(memo.content);
        localStorage.setItem(MEMO_STORAGE_KEY, memo.content);
        localStorage.setItem(MEMO_UPDATED_KEY, serverTime.toString());
      }
    }
  }, [memo, isEditing]);

  useEffect(() => {
    if (isEditing && textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, [isEditing]);

  // 自动保存逻辑（防抖）
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    
    // 立即保存到本地
    const now = Date.now();
    localStorage.setItem(MEMO_STORAGE_KEY, newContent);
    localStorage.setItem(MEMO_UPDATED_KEY, now.toString());

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetchWithRetry('/api/widget/memo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newContent }),
        });
        // 更新本地 SWR 缓存
        mutate('/api/widget/memo', { ...memo, content: newContent }, false);
      } catch (err) {
        console.error('Failed to save memo:', err);
      }
    }, 1000);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-900 text-zinc-100 select-none overflow-hidden">
      {/* 标题栏 */}
      <div 
        className="flex items-center justify-between px-3 py-2 border-b border-zinc-700 bg-zinc-800 shrink-0"
        data-drag="true"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium text-zinc-300">备忘录</h2>
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
      
      {/* 编辑/预览区域 */}
      <div 
        className="flex-1 min-h-0 overflow-hidden cursor-text"
        onClick={() => setIsEditing(true)}
      >
        {isEditing ? (
          <textarea
            ref={textAreaRef}
            className="w-full h-full bg-zinc-900 p-3 text-sm text-zinc-200 resize-none focus:outline-none leading-relaxed overflow-y-auto"
            value={content}
            onChange={handleContentChange}
            onBlur={() => setIsEditing(false)}
            placeholder="输入笔记... (支持 Markdown)"
          />
        ) : (
          <div className="w-full h-full p-3 overflow-y-auto">
            {content ? (
              <MarkdownView content={content} className="text-sm" />
            ) : (
              <div className="text-zinc-500 text-sm">
                {isLoading ? '加载中...' : '点击开始编辑...'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 状态栏 */}
      <div className="px-3 py-1.5 border-t border-zinc-700 bg-zinc-800 flex items-center justify-between shrink-0">
        <span className="text-[10px] text-zinc-500">
          {content.length} 字符
        </span>
        <span className="text-[10px] text-zinc-500">
          云端同步中
        </span>
      </div>
    </div>
  );
}
