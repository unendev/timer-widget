import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Send, Bot, User, Loader2, FileText, CheckSquare, ChevronDown, Plus, Trash2, History } from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import useSWR, { mutate } from 'swr';
import { MarkdownView } from '@/components/shared/MarkdownView';
import { fetcher, getApiUrl } from '@/lib/api';

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
  const { data: sessions = [], isLoading: sessionsLoading } = useSWR<ChatSession[]>('/api/widget/ai/sessions', fetcher);
  const [inputValue, setInputValue] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('deepseek-chat');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const processedToolCalls = useRef<Set<string>>(new Set());

  // 默认选择第一个模型
  useEffect(() => {
    const model = localStorage.getItem('widget-ai-model');
    if (model && MODELS.find(m => m.id === model)) {
      setSelectedModelId(model);
    }
  }, []);

  const selectedModel = MODELS.find(m => m.id === selectedModelId) || MODELS[0];

  const chatTransport = useMemo(() => new DefaultChatTransport({
    api: getApiUrl('/api/chat/widget'),
  }), []);

  const { messages, sendMessage, status, setMessages } = useChat({
    id: 'widget-ai',
    transport: chatTransport,
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // 自动保存当前对话到云端
  const lastSavedMessagesCount = useRef(0);
  useEffect(() => {
    if (messages.length > lastSavedMessagesCount.current && status === 'ready') {
      const saveToCloud = async () => {
        const firstUserMsg = messages.find(m => m.role === 'user');
        const title = firstUserMsg 
          ? ((firstUserMsg as any).content || (firstUserMsg as any).parts?.find((p: any) => p.type === 'text')?.text || '新对话').slice(0, 20)
          : '新对话';
        
        try {
          await fetch(getApiUrl('/api/widget/ai/sessions'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: currentSessionId,
              title,
              messages: messages,
            }),
          });
          mutate('/api/widget/ai/sessions');
          lastSavedMessagesCount.current = messages.length;
        } catch (err) {
          console.error('Failed to sync session to cloud:', err);
        }
      };
      saveToCloud();
    }
  }, [messages, status, currentSessionId]);

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    lastSavedMessagesCount.current = 0;
    processedToolCalls.current.clear();
  };

  const handleLoadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages || []);
    lastSavedMessagesCount.current = session.messages?.length || 0;
    processedToolCalls.current.clear();
    setShowHistory(false);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await fetch(getApiUrl(`/api/widget/ai/sessions?id=${sessionId}`), {
        method: 'DELETE',
      });
      mutate('/api/widget/ai/sessions');
      if (currentSessionId === sessionId) {
        handleNewChat();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
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
              {sessions.map(session => (
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

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 text-sm py-6">
            <Bot className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p>有什么可以帮你？</p>
            <p className="text-xs mt-1 text-zinc-600">可以帮你记备忘录、添加待办</p>
          </div>
        )}
        
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-5 h-5 rounded bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={10} className="text-zinc-400" />
              </div>
            )}
            <div className={`max-w-[85%] p-2 rounded text-sm ${msg.role === 'user' ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-800 border border-zinc-700 text-zinc-300'}`}>
              {msg.role === 'assistant' ? renderMessageContent(msg) : (
                <span className="text-xs">{(msg as any).content || ((msg as any).parts?.find((p: any) => p.type === 'text') as any)?.text || ''}</span>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-5 h-5 rounded bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                <User size={10} className="text-zinc-400" />
              </div>
            )}
          </div>
        ))}
        
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-2">
            <div className="w-5 h-5 rounded bg-zinc-700 flex items-center justify-center">
              <Loader2 size={10} className="text-zinc-400 animate-spin" />
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded p-2">
              <span className="text-xs text-zinc-500">思考中...</span>
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
