/**
 * hooks/useFetch.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic data-fetching hook that manages loading, data, and error states.
 * Uses formatError to ensure no raw backend details or socket traces leak.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import { formatError } from '../utils/formatError';

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
      setError(formatError(err, 'Unable to load data. Please try again.'));
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
