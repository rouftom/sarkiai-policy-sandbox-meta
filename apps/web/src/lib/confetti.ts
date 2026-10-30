/**
 * A single burst of confetti on a full-screen canvas that removes itself when
 * it has fallen. No dependency; skipped when the system asks for reduced motion.
 */

const COLORS = ['#0f766e', '#14b8a6', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7']
const DURATION_MS = 2200
const GRAVITY = 0.28
const DRAG = 0.985

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rotation: number
  spin: number
  color: string
}

export function burstConfetti(origin?: { x: number; y: number }, count = 120): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '9999',
  })
  const context = canvas.getContext('2d')
  if (!context) return
  document.body.appendChild(canvas)

  const x = origin?.x ?? window.innerWidth / 2
  const y = origin?.y ?? window.innerHeight / 2
  const pieces: Piece[] = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1
    const speed = 6 + Math.random() * 9
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 5,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? COLORS[0]!,
    }
  })

  const start = performance.now()
  const frame = (now: number) => {
    const elapsed = now - start
    context.clearRect(0, 0, canvas.width, canvas.height)
    for (const piece of pieces) {
      piece.vx *= DRAG
      piece.vy = piece.vy * DRAG + GRAVITY
      piece.x += piece.vx
      piece.y += piece.vy
      piece.rotation += piece.spin
      context.save()
      context.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS)
      context.translate(piece.x, piece.y)
      context.rotate(piece.rotation)
      context.fillStyle = piece.color
      context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2)
      context.restore()
    }
    if (elapsed < DURATION_MS) {
      window.requestAnimationFrame(frame)
    } else {
      canvas.remove()
    }
  }
  window.requestAnimationFrame(frame)
}
