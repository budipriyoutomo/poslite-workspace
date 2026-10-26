"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

import { useMediaQuery } from "@/shared/hooks"

// 15 · UX-07: from a tablet up, toasts sit at the bottom, above the screen's main button and the
// ≤96px checkout summary, so they never cover a dialog title or header. A phone keeps them at the
// top, below the 56px header: its bottom holds the navigation and the "Lihat pesanan" bar.
const WIDE = "(min-width: 768px)"
const TABLET_OFFSET = 120
const PHONE_OFFSET = 72

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const isWide = useMediaQuery(WIDE)

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={isWide ? "bottom-center" : "top-center"}
      offset={isWide ? TABLET_OFFSET : PHONE_OFFSET}
      mobileOffset={isWide ? TABLET_OFFSET : PHONE_OFFSET}
      richColors
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
