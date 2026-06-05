import * as React from "react"
import { createPortal } from "react-dom"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ComboboxContextValue<T> = {
  contentRef: React.RefObject<HTMLDivElement | null>
  items: T[]
  open: boolean
  query: string
  selected: T | null
  triggerRef: React.RefObject<HTMLElement | null>
  getItemValue: (item: T) => string
  getItemLabel: (item: T) => string
  setOpen: (open: boolean) => void
  setQuery: (query: string) => void
  setSelected: (item: T) => void
}

const ComboboxContext = React.createContext<ComboboxContextValue<unknown> | null>(null)

function useComboboxContext<T>() {
  const context = React.useContext(ComboboxContext)
  if (!context) throw new Error("Combobox components must be used within Combobox")
  return context as ComboboxContextValue<T>
}

function Combobox<T>({
  children,
  defaultValue,
  getItemLabel,
  getItemValue,
  items,
  onQueryChange,
  onValueChange,
  queryValue,
  value,
}: {
  children: React.ReactNode
  defaultValue?: T | null
  getItemLabel?: (item: T) => string
  getItemValue?: (item: T) => string
  items: T[]
  onQueryChange?: (query: string) => void
  onValueChange?: (item: T) => void
  queryValue?: string
  value?: T | null
}) {
  const [open, setOpen] = React.useState(false)
  const [innerQuery, setInnerQuery] = React.useState("")
  const [innerValue, setInnerValue] = React.useState<T | null>(defaultValue ?? null)
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  const selected = value ?? innerValue
  const query = queryValue ?? innerQuery
  const labelForItem = React.useCallback(
    (item: T) => getItemLabel?.(item) ?? String(item),
    [getItemLabel],
  )
  const valueForItem = React.useCallback(
    (item: T) => getItemValue?.(item) ?? labelForItem(item),
    [getItemValue, labelForItem],
  )
  const setSelected = React.useCallback(
    (item: T) => {
      setInnerValue(item)
      onValueChange?.(item)
      setOpen(false)
      setInnerQuery("")
      onQueryChange?.("")
    },
    [onQueryChange, onValueChange],
  )
  const setQuery = React.useCallback(
    (nextQuery: string) => {
      setInnerQuery(nextQuery)
      onQueryChange?.(nextQuery)
    },
    [onQueryChange],
  )

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const contextValue = React.useMemo<ComboboxContextValue<T>>(
    () => ({
      contentRef,
      items,
      open,
      query,
      selected,
      triggerRef,
      getItemLabel: labelForItem,
      getItemValue: valueForItem,
      setOpen,
      setQuery,
      setSelected,
    }),
    [items, labelForItem, open, query, selected, setQuery, setSelected, valueForItem],
  )

  return (
    <ComboboxContext.Provider value={contextValue as ComboboxContextValue<unknown>}>
      {children}
    </ComboboxContext.Provider>
  )
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (value: T) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(value)
      } else if (ref) {
        ref.current = value
      }
    })
  }
}

function ComboboxTrigger({
  render,
}: {
  render?: React.ReactElement<React.ComponentProps<"button">>
}) {
  const context = useComboboxContext<unknown>()
  const fallback = (
    <Button type="button" variant="outline" className="w-full justify-between font-normal">
      <ComboboxValue />
      <ChevronsUpDownIcon className="size-4 opacity-50" />
    </Button>
  )
  const element = render ?? fallback
  return React.cloneElement(element, {
    "data-slot": "combobox-trigger",
    "aria-expanded": context.open,
    ref: mergeRefs(element.props.ref, context.triggerRef as React.Ref<HTMLButtonElement>),
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      element.props.onClick?.(event)
      if (!event.defaultPrevented) context.setOpen(!context.open)
    },
  })
}

function ComboboxValue({
  placeholder = "请选择",
}: {
  placeholder?: string
}) {
  const context = useComboboxContext<unknown>()
  const label = context.selected ? context.getItemLabel(context.selected) : ""
  return (
    <span data-slot="combobox-value" className="truncate">
      {label || placeholder}
    </span>
  )
}

function ComboboxContent({
  className,
  side: _side = "bottom",
  sideOffset = 4,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "bottom"
  sideOffset?: number
}) {
  const context = useComboboxContext<unknown>()
  const [rect, setRect] = React.useState<DOMRect | null>(null)

  React.useLayoutEffect(() => {
    if (!context.open) return
    setRect(context.triggerRef.current?.getBoundingClientRect() ?? null)
  }, [context.open, context.triggerRef])

  if (!context.open || !rect) return null

  return createPortal(
    <div
      ref={context.contentRef}
      data-slot="combobox-content"
      className={cn(
        "z-50 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none",
        className,
      )}
      style={{
        left: rect.left,
        position: "fixed",
        top: rect.bottom + sideOffset,
        width: rect.width,
      }}
      {...props}
    />,
    document.body,
  )
}

function ComboboxInput({
  className,
  showTrigger: _showTrigger,
  ...props
}: React.ComponentProps<"input"> & {
  showTrigger?: boolean
}) {
  const context = useComboboxContext<unknown>()
  return (
    <input
      data-slot="combobox-input"
      className={cn(
        "mb-1 h-8 w-full rounded-md bg-background px-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
      value={context.query}
      onChange={(event) => context.setQuery(event.target.value)}
      {...props}
    />
  )
}

function ComboboxEmpty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="combobox-empty"
      className={cn("px-2 py-6 text-center text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function ComboboxList<T>({
  children,
  className,
  empty = "未找到用户",
  getSearchText,
  isLoading = false,
  loading = "加载中...",
}: {
  children: (item: T) => React.ReactNode
  className?: string
  empty?: React.ReactNode
  getSearchText?: (item: T) => string
  isLoading?: boolean
  loading?: React.ReactNode
}) {
  const context = useComboboxContext<T>()
  const query = context.query.trim().toLocaleLowerCase()
  const items = query
    ? context.items.filter((item) =>
        `${context.getItemLabel(item)} ${context.getItemValue(item)} ${getSearchText?.(item) ?? ""}`
          .toLocaleLowerCase()
          .includes(query),
      )
    : context.items
  const stateMessage = isLoading ? loading : empty
  return (
    <div data-slot="combobox-list" className={cn("max-h-64 overflow-y-auto", className)}>
      {items.length ? items.map((item) => children(item)) : <ComboboxEmpty>{stateMessage}</ComboboxEmpty>}
    </div>
  )
}

function ComboboxItem<T>({
  children,
  className,
  value,
}: {
  children: React.ReactNode
  className?: string
  value: T
}) {
  const context = useComboboxContext<T>()
  const selected =
    context.selected &&
    context.getItemValue(context.selected) === context.getItemValue(value)
  return (
    <button
      data-slot="combobox-item"
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      onClick={() => context.setSelected(value)}
    >
      <CheckIcon className={cn("size-4 opacity-0", selected && "opacity-100")} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
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
