import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-campo border border-borda bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-tinta placeholder:text-tinta-fraca focus-visible:border-acento focus-visible:ring-3 focus-visible:ring-acento/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-realce disabled:opacity-50 aria-invalid:border-negativo aria-invalid:ring-3 aria-invalid:ring-negativo/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
