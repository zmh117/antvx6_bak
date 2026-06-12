import type { ReactNode } from 'react'

export function EntityTitleCell({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium">{title}</div>
        {description ? (
          <div className="truncate text-xs text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
    </div>
  )
}
