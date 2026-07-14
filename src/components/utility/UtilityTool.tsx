import { useState, type ReactNode } from 'react'

interface UtilityToolProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

export function UtilityTool({ title, defaultOpen = false, children }: UtilityToolProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b last:border-b-0 border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition"
      >
        <span className="font-medium text-sm text-gray-700">{title}</span>
        <span className={`text-gray-400 transition-transform duration-200 text-sm ${open ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  )
}
