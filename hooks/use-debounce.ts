"use client";

import { useState, useEffect } from "react";

/**
 * Debounces a value, delaying updates until after `delay` ms of inactivity.
 * Primarily used for search inputs to avoid filtering on every keystroke.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
