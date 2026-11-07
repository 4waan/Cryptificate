/** Timer functions, injectable for tests. */
export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface Debounced<A extends unknown[]> {
  /** Schedules a call with these arguments, replacing any pending one. */
  call(...args: A): void;
  /** Runs the pending call now, if there is one. */
  flush(): void;
  /** Drops the pending call. */
  cancel(): void;
  pending(): boolean;
}

/** Calls `fn` once, `ms` after the last of a burst of calls, with the latest arguments. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number, timers: Timers = defaultTimers): Debounced<A> {
  let handle: unknown = null;
  let args: A | null = null;
  const run = () => {
    handle = null;
    const a = args;
    args = null;
    if (a) fn(...a);
  };
  return {
    call(...next: A) {
      args = next;
      if (handle !== null) timers.clear(handle);
      handle = timers.set(run, ms);
    },
    flush() {
      if (handle === null) return;
      timers.clear(handle);
      run();
    },
    cancel() {
      if (handle !== null) timers.clear(handle);
      handle = null;
      args = null;
    },
    pending: () => handle !== null,
  };
}
