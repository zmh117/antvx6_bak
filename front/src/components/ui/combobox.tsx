"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const ComboboxPortalContainerContext =
  React.createContext<React.RefObject<HTMLElement | null> | null>(null)
const ComboboxOpenContext = React.createContext<{
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
} | null>(null)

type ComboboxRootProps<T> = {
  children: React.ReactNode
  items: readonly T[]
  value?: T | null
  defaultValue?: T | null
  inputValue?: React.ComponentProps<"input">["value"]
  defaultInputValue?: string
  disabled?: boolean
  filter?: null | ((item: T, query: string, itemToString?: (item: T) => string) => boolean)
  itemToStringLabel?: (item: T) => string
  itemToStringValue?: (item: T) => string
  isItemEqualToValue?: (item: T, value: T) => boolean
  limit?: number
  modal?: boolean
  name?: string
  onInputValueChange?: (inputValue: string) => void
  onOpenChange?: (open: boolean) => void
  onValueChange?: (value: T | null) => void
  portalContainer?: React.RefObject<HTMLElement | null>
}

function Combobox<T>({
  autoHighlight = true,
  portalContainer,
  ...props
}: ComboboxRootProps<T> & {
  autoHighlight?: boolean
}) {
  const defaultPortalContainerRef = React.useRef<HTMLDivElement | null>(null)
  const portalContainerRef = portalContainer ?? defaultPortalContainerRef
  const [open, setOpen] = React.useState(false)
  const { onOpenChange, onValueChange, ...rootProps } = props

  return (
    <ComboboxPortalContainerContext.Provider value={portalContainerRef}>
      <ComboboxOpenContext.Provider value={React.useMemo(() => ({ open, setOpen }), [open])}>
        <ComboboxPrimitive.Root<T>
          data-slot="combobox"
          autoHighlight={autoHighlight}
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen)
            onOpenChange?.(nextOpen)
          }}
          onValueChange={(value) => {
            setOpen(false)
            onValueChange?.(value as T | null)
          }}
          {...rootProps}
        />
        {portalContainer ? null : (
          <div ref={defaultPortalContainerRef} data-slot="combobox-portal-container" />
        )}
      </ComboboxOpenContext.Provider>
    </ComboboxPortalContainerContext.Provider>
  )
}

function ComboboxTrigger({
  className,
  onClick,
  render,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Trigger>) {
  const openContext = React.useContext(ComboboxOpenContext)
  const fallback = (
    <Button
      type="button"
      variant="outline"
      className={cn("w-full justify-between font-normal", className)}
    >
      <ComboboxValue />
      <ChevronsUpDownIcon className="size-4 opacity-50" />
    </Button>
  )
  const element = render ?? fallback
  const trigger = React.isValidElement<React.ComponentProps<"button">>(element)
    ? React.cloneElement(element, {
        onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
          element.props.onClick?.(event)
        },
      })
    : element

  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={className}
      render={trigger}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
          window.setTimeout(() => openContext?.setOpen(true), 0)
        }
      }}
      {...props}
    />
  )
}

function ComboboxValue({
  className,
  placeholder = "请选择",
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Value> & {
  className?: string
}) {
  return (
    <span data-slot="combobox-value" className={cn("truncate", className)}>
      <ComboboxPrimitive.Value placeholder={placeholder} {...props} />
    </span>
  )
}

function ComboboxContent({
  align = "start",
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Popup> & {
  align?: "start" | "center" | "end"
  side?: "bottom"
  sideOffset?: number
}) {
  const portalContainerRef = React.useContext(ComboboxPortalContainerContext)

  return (
    <ComboboxPrimitive.Portal container={portalContainerRef}>
      <ComboboxPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionAvoidance={{ side: "none", align: "shift" }}
        className="z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "max-h-72 min-w-[var(--anchor-width)] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none",
            className,
          )}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxInput({
  className,
  showTrigger: _showTrigger,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Input> & {
  showTrigger?: boolean
}) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "mb-1 h-8 w-full rounded-md bg-background px-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  )
}

function ComboboxEmpty({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Empty>) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "px-2 py-6 text-center text-sm text-muted-foreground empty:h-0 empty:overflow-hidden empty:p-0",
        className,
      )}
      {...props}
    />
  )
}

function ComboboxList<T>({
  children,
  className,
  ...props
}: Omit<React.ComponentProps<typeof ComboboxPrimitive.List>, "children"> & {
  children: (item: T, index: number) => React.ReactNode
}) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn("max-h-64 overflow-y-auto", className)}
      {...props}
    >
      {(item, index) => children(item as T, index)}
    </ComboboxPrimitive.List>
  )
}

function ComboboxItem<T>({
  children,
  className,
  value,
  ...props
}: Omit<React.ComponentProps<typeof ComboboxPrimitive.Item>, "value"> & {
  children: React.ReactNode
  value: T
}) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      value={value}
      className={cn(
        "flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <ComboboxPrimitive.ItemIndicator>
        <CheckIcon className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </ComboboxPrimitive.Item>
  )
}

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
}
