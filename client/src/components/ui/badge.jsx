import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold tracking-[0.01em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-[#c9d7be] bg-[#e6ece0] text-[#4f6540] hover:bg-[#dce6d4] dark:border-[#506143] dark:bg-[#263321] dark:text-[#dbe8d2] dark:hover:bg-[#2e3c27]",
        secondary:
          "border-[#d5c7b7] bg-[#e7ded2] text-[#4f4137] hover:bg-[#ded3c5] dark:border-[#5c5145] dark:bg-[#302a24] dark:text-[#e6d7c4] dark:hover:bg-[#383128]",
        destructive:
          "border-[#d7ada5] bg-[#eedbd7] text-[#7e4038] hover:bg-[#e6ccc6] dark:border-[#7a4b42] dark:bg-[#3b241f] dark:text-[#f1cbc3] dark:hover:bg-[#482b25]",
        outline: "border-[#d5c7b7] bg-white/45 text-[#4f4137] dark:border-[#5c5145] dark:bg-[#241f1a]/70 dark:text-[#e6d7c4]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }
