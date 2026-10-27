'use client'

import React from 'react'
import { ChevronDown } from "lucide-react"
import { ShinyText } from '@sps/ui'
import { AnimatedTextCompletion } from '@/components/ui/animated-text-completion'

interface MessageReasoningProps {
  reasoningPart: any
  isReasoningStreaming: boolean
  isLast: boolean
  isMessageActive: boolean
  t: (key: string) => string
}

export function MessageReasoning({
  reasoningPart,
  isReasoningStreaming,
  isLast,
  isMessageActive,
  t
}: MessageReasoningProps) {
  if (!reasoningPart) return null

  return (
    <div className="flex-1 min-w-0 mt-2 mb-2">
      <details className="group" open={isReasoningStreaming}>
        <summary className="flex items-center gap-2 text-[10px] font-normal text-white/30 cursor-pointer list-none hover:text-white/50 transition-colors tracking-[0.2em] outline-none">
          <ShinyText
            text={t('chat.reasoning')}
            speed={2}
            delay={0}
            color="#aaa7a7ff"
            shineColor="#dfdcdcff"
            spread={120}
            direction="left"
            yoyo={false}
            pauseOnHover={false}
            disabled={!isMessageActive}
          />
          <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform text-foreground/80" />
        </summary>
        <div className="mt-2 pl-3 border-l-2 border-indigo-500/20 text-[10px] text-foreground/70 leading-relaxed font-medium">
          <AnimatedTextCompletion 
            isLast={isLast} 
            text={reasoningPart.reasoning} 
            isStreaming={isMessageActive} 
          />
        </div>
      </details>
    </div>
  )
}
