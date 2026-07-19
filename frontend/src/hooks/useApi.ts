import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

/**
 * Hook for polling API data at a given interval.
 * Returns the data, loading state, and a refresh function.
 */
export function usePolling<T>(
  fetcher: () => Promise<{ status: string; data?: T; [key: string]: any }>,
  intervalMs: number = 8000,
  enabled: boolean = true
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetcher();
      if (res.status === 'success' && res.data) {
        setData(res.data as T);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    if (!enabled) return;
    refresh();

    intervalRef.current = setInterval(refresh, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh, intervalMs, enabled]);

  return { data, loading, error, refresh };
}

/**
 * Pre-built hooks for each API endpoint
 */
export function useStocks() {
  return usePolling(() => api.getStocks() as any, 8000);
}

export function useLosses() {
  return usePolling(() => api.getLosses() as any, 8000);
}

export function useDepartments() {
  return usePolling(() => api.getDepartments() as any, 30000); // refresh less often
}

export function useIngredients() {
  return usePolling(() => api.getIngredients() as any, 30000);
}

export function useRecipes() {
  return usePolling(() => api.getRecipes() as any, 30000);
}

export function useTransferRequests() {
  return usePolling(() => api.getTransferRequests() as any, 5000);
}
