import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

/**
 * IMPORTANT — Radix ScrollArea Viewport `display: table` fix
 *
 * Radix UI's ScrollArea.Viewport injects a child `<div>` with `display: table`
 * to measure content width for horizontal scrollbar calculations. This breaks
 * flex-based layouts: elements with `flex-shrink`, `min-w-0`, `truncate`, etc.
 * inside the viewport cannot shrink below their content size because the table
 * layout context expands to fit ALL content, ignoring the viewport width.
 *
 * Symptom: flex columns (e.g. Artist/Album in playlist rows) overflow the
 * right edge of the viewport instead of truncating, even when `overflow-hidden`,
 * `shrink`, and `min-w-0` are applied correctly to the flex items.
 *
 * Fix: `[&>div]:!block` overrides the injected div from `display: table` to
 * `display: block`, so it respects the viewport width and flex children shrink
 * correctly. This is safe because we only use vertical scrolling — no component
 * relies on horizontal content measurement from `display: table`.
 *
 * See also: src/styles.css has a matching CSS rule as a fallback.
 */
const ScrollArea = ({ ref, className, children, ...props }: React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & { ref?: React.RefObject<React.ElementRef<typeof ScrollAreaPrimitive.Root> | null> }) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] [&>div]:!block">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
)
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = ({ ref, className, orientation = "vertical", ...props }: React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar> & { ref?: React.RefObject<React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar> | null> }) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
)
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
