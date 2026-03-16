import { useState, useRef, useEffect } from "react"
import { Search } from "lucide-react"

interface SearchableInputProps {
  name: string
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  required?: boolean
}

export function SearchableInput({ 
  name, 
  value, 
  onChange, 
  suggestions, 
  placeholder,
  required 
}: SearchableInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Filter out empty suggestions and match against current input
  const filteredSuggestions = suggestions
    .filter(Boolean)
    .filter(s => s.toLowerCase().includes(value.toLowerCase()))

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <input
          type="text"
          name={name}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setIsOpen(true)
          }}
          onFocus={(e) => {
            setIsOpen(true)
            e.target.select()
          }}
          onClick={(e) => {
            setIsOpen(true)
            ;(e.target as HTMLInputElement).select()
          }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          placeholder={placeholder}
          required={required}
          autoComplete="off"
        />
        {/* Helper icon to indicate it's searchable, or close icon to clear */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground opacity-50 flex items-center">
          {value ? (
            <button
              type="button"
              className="p-1 hover:text-foreground cursor-pointer rounded pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation()
                onChange("")
                setIsOpen(true)
              }}
              title="クリア"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          ) : (
            <Search className="w-4 h-4" />
          )}
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {isOpen && filteredSuggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-md border border-input bg-background/100 bg-white text-popover-foreground shadow-lg dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          {filteredSuggestions.map((suggestion, index) => (
            <li
              key={index}
              className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-2 px-3 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => {
                e.preventDefault() // prevent input blur before click
                onChange(suggestion)
                setIsOpen(false)
              }}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
