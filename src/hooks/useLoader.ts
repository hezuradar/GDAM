import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

export interface LoaderState<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly reload: () => Promise<void>;
}

/**
 * Runs `load` every time the screen gains focus, so data edited in other screens (or on
 * another device) is always fresh. Stale results are ignored.
 */
export function useLoader<T>(load: (signal?: AbortSignal) => Promise<T>): LoaderState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await load(controller.signal);
      if (controller.signal.aborted || id !== requestId.current) return;
      setData(result);
      setError(null);
    } catch (e: unknown) {
      if (controller.signal.aborted || id !== requestId.current) return;
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Error al leer los datos');
    } finally {
      if (controller.signal.aborted || id !== requestId.current) return;
      setLoading(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      return () => {
        // Invalidate the in-flight request and clear the spinner: otherwise blurring with a
        // pending load left `loading` true forever ("cargando" on the next screen).
        requestId.current += 1;
        setLoading(false);
      };
    }, [reload]),
  );

  return { data, error, loading, reload };
}
