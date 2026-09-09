import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-campo border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-acento focus-visible:ring-3 focus-visible:ring-acento/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-negativo aria-invalid:ring-3 aria-invalid:ring-negativo/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-acento text-superficie hover:bg-acento/90",
        outline:
          "border-borda bg-fundo hover:bg-realce hover:text-tinta aria-expanded:bg-realce aria-expanded:text-tinta",
        secondary:
          "bg-superficie-alta text-tinta hover:bg-realce aria-expanded:bg-realce aria-expanded:text-tinta",
        ghost:
          "hover:bg-realce hover:text-tinta aria-expanded:bg-realce aria-expanded:text-tinta",
        destructive:
          "bg-negativo-fundo text-negativo hover:bg-negativo/20 focus-visible:border-negativo/40 focus-visible:ring-negativo/20",
        link: "text-acento underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-campo px-2 text-xs in-data-[slot=button-group]:rounded-campo has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-campo px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-campo has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-campo in-data-[slot=button-group]:rounded-campo [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-campo in-data-[slot=button-group]:rounded-campo",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
