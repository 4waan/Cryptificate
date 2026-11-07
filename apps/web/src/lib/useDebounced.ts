import { useEffect, useState } from 'react';
import { debounce } from './debounce';

/** `value`, updated `ms` after it stops changing. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(value, settled)) return;
    const d = debounce((v: T) => setSettled(v), ms);
    d.call(value);
    return () => d.cancel();
  }, [value, ms, settled]);
  return settled;
}
