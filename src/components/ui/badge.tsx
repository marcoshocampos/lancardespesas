import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-acento focus-visible:ring-[3px] focus-visible:ring-acento/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-negativo aria-invalid:ring-negativo/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-acento text-superficie [a]:hover:bg-acento/80",
        secondary:
          "bg-superficie-alta text-tinta [a]:hover:bg-realce",
        destructive:
          "bg-negativo-fundo text-negativo focus-visible:ring-negativo/20 [a]:hover:bg-negativo/20",
        outline:
          "border-borda text-tinta [a]:hover:bg-realce [a]:hover:text-tinta-fraca",
        ghost:
          "hover:bg-realce hover:text-tinta-fraca",
        link: "text-acento underline-offset-4 hover:underline",
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
