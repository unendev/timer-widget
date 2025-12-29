import React, { useState, useEffect } from 'react'
import { ThreeLayerCategorySelector } from '../../shared/ThreeLayerCategorySelector'
import { EnhancedInstanceTagInput } from '../../shared/EnhancedInstanceTagInput'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface CreateLogFormWithCardsProps {
  onLogSaved?: () => void
  onAddToTimer?: (taskName: string, categoryPath: string, date: string, initialTime?: number, instanceTagNames?: string) => Promise<void>
  initialCategory?: string 
  selectedDate?: string;
  userId?: string;
}

export default function CreateLogFormWithCards({ onLogSaved, onAddToTimer, initialCategory, selectedDate, userId }: CreateLogFormWithCardsProps) {
  const [selectedCategory, setSelectedCategory] = useState('')
  const [taskName, setTaskName] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [timeInput, setTimeInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (initialCategory) {
      setSelectedCategory(initialCategory)
    }
  }, [initialCategory])

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
      <div className="text-center">
        <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">新建计时任务</h2>
        <p className="text-xs text-zinc-500 mt-1">快速开启一个云端同步的计时器</p>
      </div>

      <div className="space-y-6">
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

      <Button
        onClick={handleSubmit}
        disabled={isLoading || !selectedCategory}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 text-base shadow-lg shadow-emerald-900/20 transition-all active:scale-95"
      >
        {isLoading ? '添加中...' : '⏱️ 开启任务'}
      </Button>
    </div>
  )
}
