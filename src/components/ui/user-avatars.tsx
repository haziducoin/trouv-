import { cn } from "@/lib/utils"
import { AnimatePresence, motion } from "framer-motion"
import { useState, KeyboardEvent } from "react"

interface User {
  id: string | number
  name?: string
  image?: string
  color?: string
}

interface UserAvatarsProps {
  users: User[]
  size?: number | string
  className?: string
  maxVisible?: number
  overlap?: number
  focusScale?: number
  isRightToLeft?: boolean
  isOverlapOnly?: boolean
  tooltipPlacement?: "top" | "bottom"
}

export const UserAvatars = ({
  users,
  size = 56,
  className,
  maxVisible = 7,
  isRightToLeft = false,
  isOverlapOnly = false,
  overlap = 60,
  focusScale = 1.2,
  tooltipPlacement = "bottom",
}: UserAvatarsProps) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const slicedUsers = users.slice(0, Math.min(maxVisible + 1, users.length + 1))
  const exceedMaxLength = users.length > maxVisible

  const handleKeyEnter = (e: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (e.key === "Enter" || e.key === " ") setHoveredIndex(index)
  }

  return (
    <div className={cn("flex items-center relative", className)}>
      {slicedUsers.map((user, index) => {
        const isHoveredOne = hoveredIndex === index
        const isLengthBubble = exceedMaxLength && maxVisible === index

        const diff = 1 - overlap / 100
        const zIndex =
          isHoveredOne && isOverlapOnly
            ? slicedUsers.length
            : isRightToLeft
            ? slicedUsers.length - index
            : index

        const shouldScale =
          isHoveredOne && (!exceedMaxLength || slicedUsers.length - 1 !== index)

        const shouldShift =
          hoveredIndex !== null &&
          (isRightToLeft ? index < hoveredIndex : index > hoveredIndex) &&
          !isOverlapOnly

        const baseGap = Number(size) * (overlap / 100)
        const neededGap = (Number(size) * (1 + focusScale)) / 2
        const shift = Math.max(0, neededGap - baseGap)

        return (
          <motion.div
            key={user.id}
            role="img"
            aria-label={user.name || "User avatar"}
            className="relative cursor-pointer outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary rounded-full"
            style={{
              width: size,
              height: size,
              zIndex,
              marginLeft: index === 0 ? 0 : -Number(size) * diff,
            }}
            tabIndex={0}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onFocus={() => setHoveredIndex(index)}
            onBlur={() => setHoveredIndex(null)}
            onKeyDown={(e) => handleKeyEnter(e, index)}
            animate={{
              scale: shouldScale ? focusScale : 1,
              x: shouldShift ? shift * (isRightToLeft ? -1 : 1) : 0,
            }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <div className="w-full h-full rounded-full overflow-hidden border-2 border-white shadow-md">
              {isLengthBubble ? (
                <div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs font-semibold text-slate-600">
                  +{users.length - maxVisible}
                </div>
              ) : user.image ? (
                <img
                  src={user.image}
                  alt={user.name || "User"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-white font-bold"
                  style={{ background: user.color ?? '#124bd2', fontSize: `calc(${Number(size)}px * 0.35)` }}
                >
                  {user.name?.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
                </div>
              )}
            </div>

            <AnimatePresence>
              {shouldScale && user.name && (
                <motion.div
                  role="tooltip"
                  initial={{ opacity: 0, y: tooltipPlacement === "bottom" ? 8 : -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: tooltipPlacement === "bottom" ? 8 : -8 }}
                  transition={{ duration: 0.18 }}
                  className={cn(
                    "absolute left-1/2 z-50",
                    tooltipPlacement === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
                  )}
                >
                  <div className="transform -translate-x-1/2 whitespace-nowrap rounded-md bg-black text-white text-xs px-2 py-1 shadow-lg">
                    {user.name}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )
      })}
    </div>
  )
}
