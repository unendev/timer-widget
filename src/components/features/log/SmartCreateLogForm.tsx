import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Send, Keyboard } from 'lucide-react';
import { getApiUrl } from '@/lib/api';

interface SmartCreateLogFormProps {
  onSmartCreate?: (input: string) => void;
  onCancel?: () => void;
}

export default function SmartCreateLogForm({ onSmartCreate, onCancel }: SmartCreateLogFormProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleSubmit = () => {
    if (!input.trim() || !onSmartCreate) return;
    onSmartCreate(input);
    setInput('');
    // Do NOT call onCancel here if onSmartCreate exists. 
    // Let the parent handle the closing logic (e.g., waiting for IPC).
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-4 py-2">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-full mb-3">
            <Sparkles className="w-6 h-6 text-indigo-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-100">AI 智能创建</h2>
        <p className="text-sm text-gray-400 mt-1">
          输入自然语言，AI 自动识别分类、时长和标签
        </p>
      </div>

      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="例如：学习 React Hooks (前端/React) 45m #学习"
          className="min-h-[120px] text-lg bg-zinc-800 border-zinc-700 focus:border-indigo-500/50 resize-none p-4 leading-relaxed"
        />
        <div className="absolute bottom-3 right-3 text-xs text-gray-500 flex items-center gap-1">
            <Keyboard size={12} />
            <span>Enter 发送</span>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button 
            variant="ghost" 
            className="flex-1 text-gray-400 hover:text-white"
            onClick={onCancel}
        >
            取消
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!input.trim()}
          className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-6 rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
        >
          <div className="flex items-center justify-center gap-2">
            <Send className="w-5 h-5" />
            <span>立即创建</span>
          </div>
        </Button>
      </div>
    </div>
  );
}
