import React, { useState, useEffect } from 'react'
import { ThreeLayerCategorySelector } from '../../shared/ThreeLayerCategorySelector'
import { EnhancedInstanceTagInput } from '../../shared/EnhancedInstanceTagInput'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getApiUrl } from '@/lib/api'

interface CreateLogFormWithCardsProps {
  onLogSaved?: () => void
  onAddToTimer?: (taskName: string, categoryPath: string, date: string, initialTime?: number, instanceTagNames?: string) => Promise<void>
  initialCategory?: string
  selectedDate?: string;
  userId?: string;
}

export default function CreateLogFormWithCards({ onLogSaved, onAddToTimer, initialCategory, selectedDate, userId }: CreateLogFormWithCardsProps) {
  const [mode, setMode] = useState<'ai' | 'form'>(() => {
    // Lazy initialization from localStorage to prevent flicker and ensure persistence
    try {
      const saved = localStorage.getItem('timer-create-mode')
      return (saved === 'ai' || saved === 'form') ? saved : 'form'
    } catch {
      return 'form'
    }
  })
  const [aiInput, setAiInput] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [taskName, setTaskName] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [timeInput, setTimeInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // savedMode logic removed (handled in useState)

    if (initialCategory) {
      setSelectedCategory(initialCategory)
    }
  }, [initialCategory])

  const handleModeChange = (newMode: 'ai' | 'form') => {
    setMode(newMode)
    localStorage.setItem('timer-create-mode', newMode)
  }

  const handleAiSubmit = async () => {
    const input = aiInput.trim();
    if (!input) return;

    // 📝 Add detailed logging as requested
    console.log('🤖 [Create UI] AI AI Submit triggered via:', mode);
    console.log('📝 [Create UI] Input text:', input);

    // 1. Optimistic update: Close immediately
    console.log('⚡ [Create UI] Closing window immediately (Optimistic UI)');

    // Check if running in Electron
    if (window.electron) {
      console.log('ipc [Create UI] Sending ai-create-task to Main Process');
      window.electron.send('ai-create-task', {
        text: input,
        userId: userId || 'user-1', // Fallback
        autoStart: true // Default to true for AI mode
      });
      window.close();
    } else {
      // Fallback for Web Mode (Dev)
      console.warn('⚠️ [Create UI] not in Electron, falling back to fetch');
      setIsParsing(true);
      try {
        const response = await fetch(getApiUrl('/api/timer-tasks/parse'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: input })
        });

        if (!response.ok) throw new Error('AI 解析失败');

        const parsed = await response.json();
        const tagsString = parsed.instanceTags?.length > 0 ? parsed.instanceTags.join(',') : undefined

        if (onAddToTimer) {
          await onAddToTimer(parsed.name, parsed.categoryPath, selectedDate || '', 0, tagsString);
        }
        setAiInput('');
      } catch (error) {
        console.error('AI Parse Failed:', error);
        alert('AI 解析失败，请尝试手动模式');
      } finally {
        setIsParsing(false);
      }
    }
  }

  const parseTimeInput = (input: string): number | undefined => {
    if (!input.trim()) return undefined
    const minutesOnly = input.match(/^\s*(\d+)\s*$/)
    if (minutesOnly) return parseInt(minutesOnly[1]) * 60
    const hourMatch = input.match(/(\d+)h/)
    const minMatch = input.match(/(\d+)m/)
    if (hourMatch || minMatch) {
      const hours = hourMatch ? parseInt(hourMatch[1]) : 0
      const minutes = minMatch ? parseInt(minMatch[1]) : 0
      return (hours * 60 + minutes) * 60
    }
    return undefined
  }

  const getLastCategoryName = (): string => {
    if (!selectedCategory) return ''
    const parts = selectedCategory.split('/')
    return parts[parts.length - 1] || ''
  }

  const handleSubmit = async () => {
    const lastCategoryName = getLastCategoryName()
    let finalTaskName = taskName.trim()
    if (!finalTaskName && selectedTags.length > 0) {
      finalTaskName = selectedTags[0]
    } else if (!finalTaskName) {
      finalTaskName = lastCategoryName
    }

    if (!finalTaskName.trim() || !selectedCategory) {
      alert('请输入任务名称并选择分类')
      return
    }

    if (onAddToTimer) {
      setIsLoading(true)
      const tagsString = selectedTags.length > 0 ? selectedTags.join(',') : undefined
      const initialTime = parseTimeInput(timeInput)

      try {
        await onAddToTimer(finalTaskName, selectedCategory, selectedDate || '', initialTime, tagsString)
        setTaskName('')
        setSelectedCategory('')
        setSelectedTags([])
        setTimeInput('')
      } finally {
        setIsLoading(false)
      }
    }
  }

  const taskNamePlaceholder = selectedCategory
    ? `任务名称（默认：${getLastCategoryName()}）`
    : '任务名称...'

  return (
    <div className="space-y-8 pb-10">
      <div className="text-center relative">
        <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">新建计时任务</h2>
        <p className="text-xs text-zinc-500 mt-1">快速开启一个云端同步的计时器</p>

        {/* 模式切换 */}
        <div className="flex justify-center mt-6">
          <div className="flex bg-zinc-800 p-1 rounded-xl border border-zinc-700/50">
            <button
              onClick={() => handleModeChange('ai')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'ai'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-zinc-500 hover:text-zinc-300'
                }`}
            >
              AI 模式
            </button>
            <button
              onClick={() => handleModeChange('form')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'form'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-zinc-500 hover:text-zinc-300'
                }`}
            >
              手动模式
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {mode === 'ai' ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex justify-between">
                <span>自然语言输入</span>
                {isParsing && <span className="text-emerald-500 animate-pulse">正在解析...</span>}
              </label>
              <Input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isParsing) {
                    e.preventDefault();
                    handleAiSubmit();
                  }
                }}
                placeholder="例如: 蓄能、写代码 #项目..."
                className="bg-zinc-800 border-zinc-700 h-14 text-lg focus:border-emerald-500/50 focus:ring-emerald-500/20 transition-all"
                autoFocus
                disabled={isParsing}
              />
              <div className="p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/30">
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  💡 提示：AI 会自动识别分类和标签。例如输入 <span className="text-zinc-300">"蓄能"</span> 会自动匹配到 <span className="text-zinc-300">"自我复利/身体蓄能"</span>。
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ThreeLayerCategorySelector
              value={selectedCategory}
              onChange={setSelectedCategory}
            />

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">任务名称</label>
              <Input
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder={taskNamePlaceholder}
                className="bg-zinc-800 border-zinc-700 h-10"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">初始时长</label>
              <Input
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                placeholder="如: 90 或 1h30m"
                className="bg-zinc-800 border-zinc-700 h-10"
              />
            </div>

            <EnhancedInstanceTagInput
              tags={selectedTags}
              onChange={setSelectedTags}
              userId={userId || 'user-1'}
              placeholder="添加事务项标签..."
              maxTags={5}
            />
          </div>
        )}
      </div>

      <Button
        onClick={mode === 'ai' ? handleAiSubmit : handleSubmit}
        disabled={isLoading || isParsing || (mode === 'ai' ? !aiInput.trim() : !selectedCategory)}
        className={`w-full font-bold h-12 text-base shadow-lg transition-all active:scale-95 ${mode === 'ai'
          ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'
          : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'
          }`}
      >
        {isParsing ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            AI 解析中...
          </span>
        ) : isLoading ? (
          '添加中...'
        ) : (
          mode === 'ai' ? '🚀 智能开启' : '⏱️ 开启任务'
        )}
      </Button>

      {mode === 'ai' && (
        <p className="text-[10px] text-zinc-600 text-center mt-4 uppercase tracking-widest font-medium">
          Powered by DeepSeek AI
        </p>
      )}
    </div>
  )
}
