'use client'

import { useTheme } from '@/lib/theme'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
      className="w-8 h-8 flex items-center justify-center rounded-lg bg-app-card border border-app-border hover:border-accent transition-colors text-base"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
