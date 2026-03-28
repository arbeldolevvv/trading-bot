'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const Ctx = createContext<ThemeCtx>({ theme: 'dark', toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  // Read saved preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('ps-theme') as Theme | null
    if (saved === 'light') apply('light')
  }, [])

  function apply(t: Theme) {
    setTheme(t)
    if (t === 'light') {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
    localStorage.setItem('ps-theme', t)
  }

  const toggle = () => apply(theme === 'dark' ? 'light' : 'dark')

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
