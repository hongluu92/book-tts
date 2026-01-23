'use client'

import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

interface ReaderSettingsProps {
  fontSize: number
  onFontSizeChange: (size: number) => void
  theme: 'light' | 'dark'
  onThemeChange: (theme: 'light' | 'dark') => void
}

export default function ReaderSettings({
  fontSize,
  onFontSizeChange,
  theme,
  onThemeChange,
}: ReaderSettingsProps) {
  return (
    <div className="border-t bg-background px-4 py-4">
      <div className="container max-w-2xl mx-auto space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Cỡ chữ: {fontSize}px</label>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">16</span>
            <Slider
              min={16}
              max={24}
              value={fontSize}
              onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10))}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground">24</span>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Giao diện</label>
          <div className="flex gap-2">
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onThemeChange('light')}
              className="flex items-center gap-2"
            >
              <Sun className="h-4 w-4 stroke-[2]" />
              Sáng
            </Button>
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onThemeChange('dark')}
              className="flex items-center gap-2"
            >
              <Moon className="h-4 w-4 stroke-[2]" />
              Tối
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
