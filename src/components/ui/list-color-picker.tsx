import { RadioGroup } from '@ark-ui/react/radio-group'

export const LIST_COLORS = [
  { value: 'blue',   bg: 'bg-blue-500',   ring: 'ring-blue-400' },
  { value: 'red',    bg: 'bg-red-500',    ring: 'ring-red-400' },
  { value: 'green',  bg: 'bg-green-500',  ring: 'ring-green-400' },
  { value: 'purple', bg: 'bg-purple-500', ring: 'ring-purple-400' },
  { value: 'pink',   bg: 'bg-pink-500',   ring: 'ring-pink-400' },
  { value: 'yellow', bg: 'bg-yellow-400', ring: 'ring-yellow-400' },
  { value: 'orange', bg: 'bg-orange-500', ring: 'ring-orange-400' },
  { value: 'slate',  bg: 'bg-slate-500',  ring: 'ring-slate-400' },
] as const

export type ListColor = (typeof LIST_COLORS)[number]['value']

export function isListColor(value: string): value is ListColor {
  return LIST_COLORS.some(c => c.value === value)
}

export function getListColorBg(value: string): string {
  return LIST_COLORS.find(c => c.value === value)?.bg ?? 'bg-slate-400'
}

export function ListColorDot({ color, size = 'md' }: { color: string; size?: 'sm' | 'md' | 'lg' }) {
  const bg = getListColorBg(color)
  const sz = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-6 w-6' : 'h-4 w-4'
  return <span className={`inline-block shrink-0 rounded-full ${bg} ${sz}`} />
}

export function ListColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={({ value }) => onChange(value)}
      className="flex flex-wrap gap-2"
    >
      {LIST_COLORS.map(({ value: colorValue, bg, ring }) => (
        <RadioGroup.Item key={colorValue} value={colorValue} className="cursor-pointer">
          <RadioGroup.ItemControl
            className={`group flex h-6 w-6 items-center justify-center rounded-full border-2 border-transparent transition-all duration-150 data-[state=checked]:ring-2 data-[state=checked]:ring-offset-1 ${bg} ${ring}`}
          >
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="white"
              className="opacity-0 transition-opacity group-data-[state=checked]:opacity-100"
            >
              <path d="M2 5.5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </RadioGroup.ItemControl>
          <RadioGroup.ItemHiddenInput />
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
