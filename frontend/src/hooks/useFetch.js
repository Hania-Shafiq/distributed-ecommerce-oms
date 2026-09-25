/**
 * hooks/useFetch.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic data-fetching hook that manages loading, data, and error states.
 *
 * WHY A CUSTOM HOOK?
 * Every page that fetches data needs the same three pieces of state:
 *   loading → show a spinner
 *   data    → render the results
 *   error   → show an error message
 * Extracting this into a hook means we write it once and reuse it everywhere
 * rather than duplicating useState + useEffect in every page component.
 *
 * USAGE:
 *   const { data, loading, error, refetch } = useFetch(getProducts);
 *   const { data } = useFetch(() => getProductById(id), [id]);
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * @param {Function} fetchFn   - An async function that returns data (from api/).
 * @param {Array}    deps      - Dependency array — re-runs fetchFn when these change.
 * @param {boolean}  immediate - If false, don't fetch on mount (call refetch manually).
 */
export function useFetch(fetchFn, deps = [], immediate = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      // Extract a human-readable message from Axios error or plain Error
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'An unexpected error occurred';
      setError(message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (immediate) execute();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute]);

  return { data, loading, error, refetch: execute };
}
