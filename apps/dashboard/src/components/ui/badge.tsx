import { cn } from "@/lib/utils"
// Badges communicate status and semantic categories without taking over the layout.
// They use the same radius and contrast rules as the rest of the dashboard surface.
import { type VariantProps, cva } from "class-variance-authority"
import type * as React from "react"

const badgeVariants = cva(
  "inline-flex min-h-6 items-center rounded-md border px-2 py-0.5 text-xs font-medium tracking-normal",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        error: "border-destructive/30 bg-destructive/10 text-destructive",
        outline: "border-border text-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        warning: "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      },
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ className, variant }))} {...props} />
}
