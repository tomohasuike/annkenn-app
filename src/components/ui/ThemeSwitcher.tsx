import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTheme, type Theme } from "../../contexts/ThemeProvider"
import { Palette, Check, Moon, Sun, Heart, Leaf } from "lucide-react"

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  const themes: { id: Theme; icon: any; label: string }[] = [
    { id: "light", icon: Sun, label: "クリーン (ライト)" },
    { id: "dark", icon: Moon, label: "リッチ (ダーク)" },
    { id: "friendly", icon: Palette, label: "親しみやすい (ブルー)" },
    { id: "elegant", icon: Heart, label: "エレガント (ピンク)" },
    { id: "natural", icon: Leaf, label: "ナチュラル (グリーン)" },
  ]

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button 
          className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          aria-label="テーマ設定"
        >
          <Palette className="w-5 h-5" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content 
          className="min-w-[200px] bg-popover text-popover-foreground rounded-md p-1 shadow-md border animate-in fade-in-80 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 z-50"
          sideOffset={5}
          align="end"
        >
          <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground mb-1">
            デザインテーマ
          </div>
          
          {themes.map((t) => {
            const Icon = t.icon
            const isActive = theme === t.id
            return (
              <DropdownMenu.Item
                key={t.id}
                onClick={() => setTheme(t.id)}
                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <Icon className="w-4 h-4 mr-2 opacity-70" />
                <span className="flex-1">{t.label}</span>
                {isActive && (
                  <Check className="w-4 h-4 ml-auto" />
                )}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
