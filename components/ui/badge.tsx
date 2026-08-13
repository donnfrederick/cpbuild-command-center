import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-accent-subtle)] text-[var(--color-accent-hover)] border-transparent [a&]:hover:bg-[var(--color-accent-muted)]",
        secondary:
          "bg-[var(--color-secondary-subtle)] text-[var(--blue-700)] border-transparent [a&]:hover:bg-[var(--color-secondary-muted)]",
        destructive:
          "bg-[var(--color-error)] text-[var(--color-text-inverse)] border-transparent [a&]:hover:opacity-90 focus-visible:ring-destructive/20",
        outline:
          "bg-[var(--color-surface-sunken)] text-[var(--neutral-700)] border-transparent [a&]:hover:bg-[var(--color-divider)]",
        ghost:
          "border-transparent [a&]:hover:bg-[var(--color-surface-sunken)] [a&]:hover:text-[var(--color-text-primary)]",
        link:
          "text-[var(--color-accent)] border-transparent underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
