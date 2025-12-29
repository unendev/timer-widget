import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownViewProps {
  content: string;
  className?: string;
  variant?: 'default' | 'goc' | 'light';
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  content,
  className,
}) => {
  return (
    <div className={cn('markdown-view prose prose-invert max-w-none', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
};
