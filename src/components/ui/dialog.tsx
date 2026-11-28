import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "~/lib/utils"
import { useSheetDrag } from "@/components/glass/GlassSheet"
import { useIsPhone } from "@/lib/hooks/useIsPhone"
import { useGlassUi } from "@/lib/hooks/useGlassUi"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  sheet = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** Glass UI on phones: show as the shared bottom sheet (grabber, drag down
   *  or tap the grabber to close) instead of a centred dialog. */
  sheet?: boolean
}) {
  const glass = useGlassUi()
  const phone = useIsPhone()
  if (sheet && glass && phone) {
    return (
      <SheetDialogContent className={className} showCloseButton={showCloseButton} {...props}>
        {children}
      </SheetDialogContent>
    )
  }
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

/** The `sheet` form of DialogContent (glass phones). The caller's classes go
 *  first so the sheet's position, size and surface win over a dialog's. */
function SheetDialogContent({
  className,
  children,
  showCloseButton,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  // Closing goes through Radix's own Close so the dialog's onOpenChange runs
  // exactly as it does for the × (cleanup, confirmations).
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const close = React.useCallback(() => closeRef.current?.click(), [])
  const { sheetRef, headerHandlers } = useSheetDrag(close)
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogPrimitive.Overlay data-slot="dialog-overlay" className="glass-sheet-overlay fixed inset-0 z-[70] bg-black/50" />
      <DialogPrimitive.Content
        ref={sheetRef}
        data-slot="dialog-content"
        className={cn(
          className,
          "glass-sheet glass-surface fixed inset-x-2 bottom-2 top-auto left-auto z-[71] flex w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-4 overflow-y-auto overscroll-contain rounded-[26px] border-white/10 bg-background/85 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-0 text-foreground shadow-none sm:max-w-none dark:bg-[rgb(22_20_32/0.88)]",
          "max-h-[calc(100dvh-env(safe-area-inset-top)-3rem)] min-h-0",
          // sheet heading like GlassSheet: left, 22px display, clear of the ×
          "[&_[data-slot=dialog-header]]:-mt-2 [&_[data-slot=dialog-header]]:pr-10 [&_[data-slot=dialog-header]]:text-left [&_[data-slot=dialog-title]]:font-display [&_[data-slot=dialog-title]]:text-[22px] [&_[data-slot=dialog-title]]:font-extrabold [&_[data-slot=dialog-title]]:leading-7 [&_[data-slot=dialog-title]]:tracking-[-0.02em]"
        )}
        {...props}
      >
        <div className="-mx-4 shrink-0 touch-none select-none px-4" {...headerHandlers}>
          <button
            type="button"
            data-grabber
            onClick={(e) => { if (e.detail === 0) close() }}
            aria-label="Close"
            className="flex h-6 w-full items-center justify-center [-webkit-tap-highlight-color:transparent]"
          >
            <span aria-hidden className="block h-1.5 w-10 rounded-full bg-foreground/30" />
          </button>
        </div>
        {children}
        <DialogPrimitive.Close
          ref={closeRef}
          data-slot="dialog-close"
          className={cn(
            "absolute right-3 top-3 grid size-9 place-items-center rounded-full text-muted-foreground",
            !showCloseButton && "sr-only"
          )}
        >
          <XIcon className="size-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
