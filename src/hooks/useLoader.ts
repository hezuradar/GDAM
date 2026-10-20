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
export function useLoader<T>(load: () => Promise<T>): LoaderState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await load();
      if (id === requestId.current) {
        setData(result);
        setError(null);
      }
    } catch (e: unknown) {
      if (id === requestId.current) {
        setError(e instanceof Error ? e.message : 'Error al leer los datos');
      }
    } finally {
      if (id === requestId.current) setLoading(false);
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
