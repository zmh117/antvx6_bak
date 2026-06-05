import { useCallback, useEffect, useState } from 'react'

type SearchParamsSerializer<T> = (state: T) => URLSearchParams
type SearchParamsParser<T> = (params: URLSearchParams) => T

function currentParams() {
  return new URLSearchParams(window.location.search)
}

function replaceSearch(params: URLSearchParams) {
  const query = params.toString()
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`
  if (`${window.location.pathname}${window.location.search}` === nextUrl) return
  window.history.replaceState(null, '', nextUrl)
}

export function useUrlSearchState<T>(
  parse: SearchParamsParser<T>,
  serialize: SearchParamsSerializer<T>,
) {
  const [state, setState] = useState<T>(() => parse(currentParams()))

  useEffect(() => {
    const onPopState = () => setState(parse(currentParams()))
    window.addEventListener('popstate', onPopState)
    window.addEventListener('dashboard:navigate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('dashboard:navigate', onPopState)
    }
  }, [parse])

  const updateState = useCallback(
    (updater: Partial<T> | ((current: T) => T)) => {
      setState((current) => {
        const next =
          typeof updater === 'function' ? updater(current) : ({ ...current, ...updater } as T)
        replaceSearch(serialize(next))
        return next
      })
    },
    [serialize],
  )

  return [state, updateState] as const
}
