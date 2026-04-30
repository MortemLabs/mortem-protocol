import { cn } from "@/lib/utils"
// Brutal square buttons per Mortem brand. Mono uppercase by default — the body
// is sans, but click targets read as case-file labels.
import { Slot } from "@radix-ui/react-slot"
import { type VariantProps, cva } from "class-variance-authority"
import type * as React from "react"

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-none font-mono text-[0.6875rem] font-medium uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-10 px-4",
        icon: "h-10 w-10",
        lg: "h-12 px-6",
        sm: "h-8 px-3",
      },
      variant: {
        default: "bg-signal text-paper hover:brightness-110",
        destructive: "bg-signal text-paper hover:brightness-110",
        ghost: "text-foreground hover:bg-ink-3",
        outline: "border border-line bg-transparent text-foreground hover:bg-ink-3",
        secondary: "border border-line bg-ink-2 text-paper hover:bg-ink-3",
      },
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ asChild = false, className, size, variant, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button"

  return <Comp className={cn(buttonVariants({ className, size, variant }))} {...props} />
}

export { buttonVariants }
