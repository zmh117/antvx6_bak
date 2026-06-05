import * as React from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "vertical" | "horizontal" | "responsive"
}) {
  return (
    <div
      data-slot="field"
      data-orientation={orientation}
      className={cn(
        "grid gap-2 data-[orientation=horizontal]:grid-cols-[1fr_auto] data-[orientation=horizontal]:items-center data-[orientation=responsive]:gap-3 sm:data-[orientation=responsive]:grid-cols-[1fr_auto] sm:data-[orientation=responsive]:items-center",
        className,
      )}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("grid gap-1.5", className)}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("grid gap-4", className)}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn("data-[error=true]:text-destructive", className)}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function errorToText(error: unknown) {
  if (typeof error === "string") return error
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
  }
  return String(error)
}

function FieldError({
  className,
  errors,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: unknown[]
}) {
  const body = children ?? errors?.map(errorToText).join(" ")
  if (!body) return null
  return (
    <div
      data-slot="field-error"
      className={cn("text-xs font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </div>
  )
}

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn("grid gap-4", className)}
      {...props}
    />
  )
}

function FieldLegend({ className, ...props }: React.ComponentProps<"legend">) {
  return (
    <legend
      data-slot="field-legend"
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  )
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
}
