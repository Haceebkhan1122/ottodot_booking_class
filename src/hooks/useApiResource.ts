'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toApiError, type ApiError } from '@/apiservice/axiosInstance';

interface ApiResourceState<T> {
  data: T | null;
  error: ApiError | null;
  /** True only on the first load, so a refresh does not blank the screen. */
  isLoading: boolean;
  /** True on every load including refreshes. Drives subtle busy affordances. */
  isFetching: boolean;
  refetch: () => Promise<void>;
  /** Applies a server response we already have, avoiding a pointless round trip. */
  setData: (next: T) => void;
}

/**
 * Small fetch-on-mount hook.
 *
 * Deliberately not TanStack Query. This app has six screens and no shared
 * cache to keep warm; a query cache here would mostly add a second copy of the
 * seat count that can disagree with the server. The interesting correctness
 * work in this project belongs on the backend, and the frontend's job is to
 * stay out of its way.
 *
 * It does handle the two things that actually bite: in-flight requests are
 * aborted on unmount, and a slow response that lands after unmount cannot set
 * state on a dead component.
 */
export function useApiResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList = [],
): ApiResourceState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(true);

  const mountedRef = useRef(true);
  const hasLoadedRef = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableFetcher = useCallback(fetcher, deps);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setIsFetching(true);
      if (!hasLoadedRef.current) setIsLoading(true);

      try {
        const result = await stableFetcher(signal);
        if (signal.aborted || !mountedRef.current) return;
        setDataState(result);
        setError(null);
      } catch (caught) {
        if (signal.aborted || !mountedRef.current) return;
        // An abort surfaces as a rejection too - it is not a real failure.
        if ((caught as { code?: string })?.code === 'ERR_CANCELED') return;
        setError(toApiError(caught));
      } finally {
        if (mountedRef.current && !signal.aborted) {
          hasLoadedRef.current = true;
          setIsLoading(false);
          setIsFetching(false);
        }
      }
    },
    [stableFetcher],
  );

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    void load(controller.signal);

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [load]);

  const refetch = useCallback(async () => {
    const controller = new AbortController();
    await load(controller.signal);
  }, [load]);

  const setData = useCallback((next: T) => setDataState(next), []);

  return { data, error, isLoading, isFetching, refetch, setData };
}
