'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { animate, useMotionValue } from 'framer-motion'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import dynamic from 'next/dynamic'
import { ChevronDown } from "lucide-react"
import { ShinyText } from '@sps/ui'
import { useI18n } from '@/lib/i18n'

// `react-syntax-highlighter` (Prism + theme) is heavy and only needed when a
// fenced code block is rendered → load it on demand.
const SyntaxHighlighter = dynamic(
  () => import('react-syntax-highlighter').then((m) => m.Prism),
  { ssr: false },
)
const vscDarkPlusTheme = () =>
  import('react-syntax-highlighter/dist/esm/styles/prism').then((m) => m.vscDarkPlus)

const delimiter = ''

interface AnimatedTextCompletionProps {
  text: string
  isLast: boolean
  isStreaming: boolean
}

export function useAnimatedText({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const animatedCursor = useMotionValue(0)

  const [cursor, setCursor] = useState(0)
  const [prevText, setPrevText] = useState(text)
  const [isSameText, setIsSameText] = useState(true)
  const [isAnimating, setIsAnimating] = useState(false)

  if (prevText !== text) {
    setPrevText(text)
    setIsSameText(text.startsWith(prevText))

    if (!text.startsWith(prevText)) {
      setCursor(0)
    }
  }

  useEffect(() => {
    if (!isSameText) {
      animatedCursor.jump(0)
    }

    setIsAnimating(true)

    const controls = animate(animatedCursor, text.split(delimiter).length, {
      duration: 0.5,
      ease: 'easeOut',
      onUpdate(latest) {
        setCursor(Math.floor(latest))
      },
      onComplete() {
        setIsAnimating(false)
      },
    })

    return () => controls.stop()
  }, [animatedCursor, isSameText, text, isStreaming])

  return {
    animatedText: text.split(delimiter).slice(0, cursor).join(delimiter),
    isAnimating,
  }
}

function ThinkBlock({ children }: { children: any }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)

  return (
    <span className="block flex-1 min-w-0 mt-2 mb-2">
      <span
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 text-[10px] font-normal text-white/30 cursor-pointer list-none hover:text-white/50 transition-colors tracking-[0.2em] outline-none select-none"
      >
        <ShinyText
          text={t('chat.reasoning') || 'REASONING'}
          speed={2}
          delay={0}
          color="#aaa7a7ff"
          shineColor="#dfdcdcff"
          spread={120}
          direction="left"
          yoyo={false}
          pauseOnHover={false}
          disabled={false}
        />
        <ChevronDown className={`w-3 h-3 transition-transform text-foreground/80 ${open ? 'rotate-180' : ''}`} />
      </span>
      {open && (
        <span className="block mt-2 pl-3 border-l-2 border-brand-primary/20 text-[10px] text-foreground/70 leading-relaxed font-medium">
          {children}
        </span>
      )}
    </span>
  )
}

export function AnimatedTextCompletion({ text, isLast, isStreaming }: AnimatedTextCompletionProps) {
  const { animatedText } = useAnimatedText({ text, isStreaming })
  const [codeTheme, setCodeTheme] = useState<Record<string, unknown> | null>(null)

  // Load the Prism theme lazily only when the message contains code.
  useEffect(() => {
    if (!/```/.test(text) || codeTheme) return
    let cancelled = false
    const timer = setTimeout(() => {
      vscDarkPlusTheme().then((theme) => {
        if (!cancelled) setCodeTheme(theme as Record<string, unknown>)
      })
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [text, codeTheme])

  const displayText = isLast && isStreaming ? animatedText : text

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          img({ src, alt }: any) {
            return (
              <img src={src} alt={alt || ''} loading="lazy" className="my-3 h-auto w-full max-w-md rounded-xl" />
            )
          },
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <div className="my-2 rounded-xl overflow-hidden border border-neutral-200 dark:border-white/10 shadow-sm">
                <div className="bg-neutral-100 dark:bg-neutral-900/50 px-4 py-2 border-b border-neutral-200 dark:border-white/10 flex items-center justify-between">
                  <span className="text-[10px] font-light uppercase tracking-widest text-neutral-500">
                    {match[1]}
                  </span>
                </div>
                <SyntaxHighlighter
                  style={codeTheme ?? undefined}
                  language={match[1]}
                  PreTag="div"
                  className="!m-0 !bg-neutral-950"
                  customStyle={{
                    padding: '1.5rem',
                    fontSize: '0.875rem',
                    lineHeight: '1.5',
                  }}
                  showLineNumbers={false}
                  wrapLongLines={true}
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            ) : (
              <code className={`${className} bg-neutral-100 dark:bg-white/5 px-1.5 py-0.5 rounded-md font-mono text-[0.9em] text-brand-primary dark:text-brand-teal`} {...props}>
                {children}
              </code>
            );
          },
          table({ children }: any) {
            return (
              <div className="my-2 w-full overflow-x-auto bg-slate-200 dark:bg-brand-primary-dark/20">
                <table className="min-w-full divide-y divide-neutral-200 dark:divide-white/10 !m-0">
                  {children}
                </table>
              </div>
            )
          },
          thead({ children }: any) {
            return <thead className="bg-slate-600 dark:bg-white/5">{children}</thead>
          },
          th({ children }: any) {
            return <th className="px-2 py-1.5 text-left text-xs tracking-widest text-white">{children}</th>
          },
          td({ children }: any) {
            return <td className="px-2 py-2 text-xs border-b border-neutral-400 dark:border-white/5">{children}</td>
          },
          // Tailwind v4 has no typography plugin, so preflight zeroes the
          // paragraph/list/heading margins — restore readable spacing explicitly.
          p({ children }: any) {
            return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
          },
          ul({ children }: any) {
            return <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
          },
          ol({ children }: any) {
            return <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          },
          h1({ children }: any) {
            return <h1 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h1>
          },
          h2({ children }: any) {
            return <h2 className="mb-2 mt-4 text-sm font-semibold first:mt-0">{children}</h2>
          },
          h3({ children }: any) {
            return <h3 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h3>
          },
          a({ href, children }: any) {
            return <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{children}</a>
          },
          blockquote({ children }: any) {
            return <blockquote className="mb-3 border-l-2 border-primary/30 pl-3 italic text-muted-foreground">{children}</blockquote>
          },
          think({ children }: any) {
            return <ThinkBlock>{children}</ThinkBlock>
          }
        } as any
      }>
        {displayText}
      </ReactMarkdown>
    </div>
  )
}
