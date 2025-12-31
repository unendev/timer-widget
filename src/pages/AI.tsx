import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Send, Bot, User, Loader2, FileText, CheckSquare, ChevronDown, Plus, Trash2, History } from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import useSWR, { mutate } from 'swr';
import { MarkdownView } from '@/components/shared/MarkdownView';
import { fetcher, getApiUrl } from '@/lib/api';

const AI_SESSIONS_STORAGE_KEY = 'ai-chat-sessions-v1';
const AI_SESSIONS_UPDATED_KEY = 'ai-chat-sessions-updated-at';

const MODELS = [
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'deepseek' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro', provider: 'gemini' },
];

const ReasoningBlock = ({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) => {
  const [expanded, setExpanded] = useState(isStreaming);
  const contentRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => { setExpanded(isStreaming); }, [isStreaming]);
  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isStreaming]);
  
  return (
    <div className="my-1 border border-zinc-600 rounded overflow-hidden bg-zinc-800/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-2 py-1 flex items-center gap-1.5 text-[10px] text-zinc-400 hover:bg-zinc-700/50 transition-colors"
      >
        <span>{isStreaming ? '💭 思考中...' : '💭 思考过程'}</span>
        <span className="text-zinc-500 text-[9px]">({content.length}字)</span>
        <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${expanded ? '' : '-rotate-90'}`} />
      </button>
      {expanded && (
        <div ref={contentRef} className="px-2 py-1.5 text-[10px] text-zinc-400 border-t border-zinc-700 max-h-32 overflow-y-auto">
          <pre className="whitespace-pre-wrap font-mono leading-relaxed">{content}</pre>
          {isStreaming && <span className="inline-block w-1 h-2 bg-zinc-400 animate-pulse ml-0.5" />}
        </div>
      )}
    </div>
  );
};

interface ChatSession {
  id: string;
  title: string;
  messages: any[];
  updatedAt: string;
}

export default function AIPage() {
  // State for sessions, initialized from localStorage
  const [localSessions, setLocalSessions] = useState<ChatSession[]>(() => {
    try {
      const savedSessions = localStorage.getItem(AI_SESSIONS_STORAGE_KEY);
      return savedSessions ? JSON.parse(savedSessions) : [];
    } catch (error) {
      console.error("Failed to parse AI sessions from localStorage:", error);
      return [];
    }
  });

  const { data: serverSessions = [], isLoading: sessionsLoading } = useSWR<ChatSession[]>('/api/widget/ai/sessions', fetcher, {
    onSuccess: (data) => {
      // Sync server data to local storage if newer or local is empty
      const localUpdatedAt = parseInt(localStorage.getItem(AI_SESSIONS_UPDATED_KEY) || "0");
      const serverUpdatedAt = data.reduce((max, session) => Math.max(max, new Date(session.updatedAt).getTime()), 0);
      
      if (!localSessions.length || serverUpdatedAt > localUpdatedAt) {
        console.log("Syncing AI sessions from server (newer version found)");
        setLocalSessions(data);
        localStorage.setItem(AI_SESSIONS_STORAGE_KEY, JSON.stringify(data));
        localStorage.setItem(AI_SESSIONS_UPDATED_KEY, serverUpdatedAt.toString());
      }
    },
  });

  // Combine local and server data, giving precedence to local changes not yet synced
  const sessions = useMemo(() => {
    const serverSessionMap = new Map(serverSessions.map(session => [session.id, session]));
    const combined = [...localSessions];

    serverSessions.forEach(serverSession => {
      if (!combined.some(localSession => localSession.id === serverSession.id)) {
        combined.push(serverSession);
      }
    });
    
    // Sort by updatedAt, newest first
    combined.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return combined;
  }, [localSessions, serverSessions]);

  const [inputValue, setInputValue] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('deepseek-chat');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => localStorage.getItem('widget-ai-current-session-id'));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const processedToolCalls = useRef<Set<string>>(new Set());
  const previousSessionIdRef = useRef<string | null>(null);

  const selectedModel = MODELS.find(m => m.id === selectedModelId) || MODELS[0];

  const chatTransport = useMemo(() => new DefaultChatTransport({
    api: getApiUrl('/api/chat/widget'),
  }), []);

  const { messages, sendMessage, status, setMessages } = useChat({
    id: currentSessionId || 'widget-ai',
    transport: chatTransport,
  });

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      // Allow a small buffer (e.g. 50px)
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      isAtBottomRef.current = isAtBottom;
    }
  }, []);

  // Default select the first model and current session
  useEffect(() => {
    const model = localStorage.getItem('widget-ai-model');
    if (model && MODELS.find(m => m.id === model)) {
      setSelectedModelId(model);
    }
    // Load current session messages if currentSessionId is set
    if (currentSessionId) {
      const sessionToLoad = sessions.find(s => s.id === currentSessionId);
      
      const isSessionSwitch = currentSessionId !== previousSessionIdRef.current;
      const isInitialLoad = !previousSessionIdRef.current;
      
      if (sessionToLoad && (isSessionSwitch || isInitialLoad)) {
        setMessages(sessionToLoad.messages || []);
        lastSavedMessagesCount.current = sessionToLoad.messages?.length || 0;
        processedToolCalls.current.clear();
        previousSessionIdRef.current = currentSessionId;
        // On new session load, we want to scroll to bottom
        isAtBottomRef.current = true;
      }
    }
  }, [sessions, currentSessionId, setMessages]);

  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('widget-ai-current-session-id', currentSessionId);
    } else {
      localStorage.removeItem('widget-ai-current-session-id');
    }
  }, [currentSessionId]);

  const isLoading = status === 'streaming' || status === 'submitted';

  const syncSessionsToLocal = useCallback((updatedSessions: ChatSession[]) => {
    const now = Date.now();
    setLocalSessions(updatedSessions);
    localStorage.setItem(AI_SESSIONS_STORAGE_KEY, JSON.stringify(updatedSessions));
    localStorage.setItem(AI_SESSIONS_UPDATED_KEY, now.toString());
    mutate('/api/widget/ai/sessions', updatedSessions, false); // Update SWR cache optimistically
  }, []);

  // Auto-save current conversation to cloud AND local storage
  const lastSavedMessagesCount = useRef(0);
  useEffect(() => {
    if (messages.length > 0 && status === 'ready' && messages.length > lastSavedMessagesCount.current) {
      const saveSession = async () => {
        let sessionId = currentSessionId;
        let isNewSession = !sessionId;

        // If it's a new session, create an ID for it
        if (isNewSession) {
          sessionId = `local-${Date.now()}`;
          setCurrentSessionId(sessionId); // Set the ID immediately to prevent multiple creations
        }

        const firstUserMsg = messages.find(m => m.role === 'user');
        const title = firstUserMsg 
          ? ((firstUserMsg as any).content || (firstUserMsg as any).parts?.find((p: any) => p.type === 'text')?.text || '新对话').slice(0, 20)
          : '新对话';
        
        const newSessionData: ChatSession = {
          id: sessionId!,
          title,
          messages: messages,
          updatedAt: new Date().toISOString(),
        };

        // Update local sessions immediately
        const existingIndex = localSessions.findIndex(s => s.id === sessionId);
        const updatedLocalSessions = existingIndex > -1
          ? localSessions.map((s, i) => i === existingIndex ? newSessionData : s)
          : [...localSessions, newSessionData];
        syncSessionsToLocal(updatedLocalSessions);
        lastSavedMessagesCount.current = messages.length;

        try {
          const response = await fetch(getApiUrl('/api/widget/ai/sessions'), {
            method: 'POST', // Always POST, the backend should handle create/update logic (upsert)
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSessionData),
          });

          if (response.ok) {
            const savedSession = await response.json();
            // If it was a new session, update the local ID with the one from the server
            if (isNewSession && savedSession.id !== sessionId) {
              setCurrentSessionId(savedSession.id);
              const finalSessions = updatedLocalSessions.map(s => s.id === sessionId ? savedSession : s);
              syncSessionsToLocal(finalSessions);
            }
          }
          mutate('/api/widget/ai/sessions'); // Revalidate with server data
        } catch (err) {
          console.error('Failed to sync session to cloud:', err);
          mutate('/api/widget/ai/sessions'); // Revert or show error
        }
      };
      saveSession();
    }
  }, [messages, status, currentSessionId, localSessions, syncSessionsToLocal]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId);
    localStorage.setItem('widget-ai-model', modelId);
    setShowModelDropdown(false);
  };

  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    lastSavedMessagesCount.current = 0;
    processedToolCalls.current.clear();
    // Also update local storage to reflect no current session
    localStorage.removeItem('widget-ai-current-session-id');
  };

  const handleLoadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages || []);
    lastSavedMessagesCount.current = session.messages?.length || 0;
    processedToolCalls.current.clear();
    setShowHistory(false);
    localStorage.setItem('widget-ai-current-session-id', session.id);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    // Optimistically update local state
    const updatedLocalSessions = localSessions.filter(s => s.id !== sessionId);
    syncSessionsToLocal(updatedLocalSessions);

    try {
      await fetch(getApiUrl(`/api/widget/ai/sessions?id=${sessionId}`), {
        method: 'DELETE',
      });
      mutate('/api/widget/ai/sessions'); // Revalidate with server data
      if (currentSessionId === sessionId) {
        handleNewChat();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
      mutate('/api/widget/ai/sessions'); // Revert or show error
    }
  };

  const handleSubmit = () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;
    
    sendMessage({ text }, { 
      body: { provider: selectedModel.provider, modelId: selectedModel.id } 
    });
    setInputValue('');
  };

  const renderMessageContent = (msg: any) => {
    if (!msg.parts) {
      return <MarkdownView content={msg.content || '...'} className="text-xs" />;
    }
    
    let reasoningContent = '';
    let reasoningState: string | undefined;
    const textParts: string[] = [];
    
    msg.parts.forEach((part: any) => {
      if (part.type === 'reasoning') {
        reasoningContent += part.text || '';
        reasoningState = part.state;
      } else if (part.type === 'text') {
        textParts.push(part.text || '');
      }
    });
    
    const isReasoningStreaming = reasoningState === 'streaming';
    const textContent = textParts.join('');
    
    return (
      <>
        {reasoningContent && <ReasoningBlock content={reasoningContent} isStreaming={isReasoningStreaming} />}
        {textContent && <MarkdownView content={textContent} className="text-xs" />}
        {!reasoningContent && !textContent && '...'}
      </>
    );
  };

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-900 text-zinc-100 select-none overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700 bg-zinc-800 shrink-0" data-drag="true">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium text-zinc-300">AI 助手</h2>
          {sessionsLoading && <Loader2 size={10} className="animate-spin text-zinc-500" />}
        </div>
        <div className="flex items-center gap-1" data-drag="false">
          <button onClick={handleNewChat} className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors" title="新对话">
            <Plus size={12} />
          </button>
          <button onClick={() => setShowHistory(!showHistory)} className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${showHistory ? 'text-emerald-400 bg-zinc-700' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700'}`} title="历史记录">
            <History size={12} />
          </button>
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setShowModelDropdown(!showModelDropdown)} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors">
              <span className="max-w-[60px] truncate">{selectedModel.name}</span>
              <ChevronDown size={10} className={`transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showModelDropdown && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50">
                {MODELS.map(model => (
                  <button key={model.id} onClick={() => handleModelChange(model.id)} className={`w-full text-left px-2 py-1.5 text-[10px] hover:bg-zinc-700 transition-colors ${model.id === selectedModelId ? 'text-emerald-400 bg-zinc-700/50' : 'text-zinc-300'}`}>
                    {model.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => window.close()} className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-600 transition-colors">
            <X size={12} />
          </button>
        </div>
      </div>
      
      {showHistory && (
        <div className="border-b border-zinc-700 bg-zinc-800/80 max-h-40 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="text-center text-zinc-500 text-xs py-3">暂无历史记录</div>
          ) : (
            <div className="py-1">
              {sessions.map((session: ChatSession) => (
                <div
                  key={session.id}
                  onClick={() => handleLoadSession(session)}
                  className={`flex items-center justify-between px-3 py-1.5 hover:bg-zinc-700/50 cursor-pointer group ${session.id === currentSessionId ? 'bg-zinc-700/30' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-300 truncate">{session.title}</div>
                    <div className="text-[10px] text-zinc-500">{new Date(session.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(e, session.id)}
                    className="w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-zinc-600 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-6 select-text"
      >
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 text-sm py-10">
            <p>有什么可以帮你？</p>
          </div>
        )}
        
        {messages.map(msg => (
          <div key={msg.id} className="flex flex-col gap-1">
            <div className={`text-[10px] text-zinc-500 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              {msg.role === 'user' ? 'You' : selectedModel.name}
            </div>
            <div className={`w-full text-sm leading-relaxed ${msg.role === 'user' ? 'text-zinc-300 bg-zinc-800/50 p-2 rounded-lg' : 'text-zinc-100'}`}>
              {msg.role === 'assistant' ? renderMessageContent(msg) : (
                <span className="whitespace-pre-wrap">{(msg as any).content || ((msg as any).parts?.find((p: any) => p.type === 'text') as any)?.text || ''}</span>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex flex-col gap-1">
            <div className="text-[10px] text-zinc-500 text-left">AI</div>
            <div className="flex items-center gap-2 text-zinc-400">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-xs">思考中...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-2 border-t border-zinc-700 bg-zinc-800 shrink-0">
        <div className="flex gap-1.5">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
            placeholder="输入问题..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors placeholder:text-zinc-600"
            disabled={isLoading}
          />
          <button onClick={handleSubmit} disabled={isLoading} className="px-2.5 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300 transition-colors disabled:opacity-50">
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
