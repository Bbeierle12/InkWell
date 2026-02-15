'use client';

/**
 * SearchBar Component
 *
 * Search input at the top of the sidebar.
 * Filters documents by title in real-time (debounced 200ms).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useDocumentStore } from '@/lib/document-store';

export function SearchBar() {
  const { setSearchQuery } = useDocumentStore();
  const [localValue, setLocalValue] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalValue(value);

      // Debounce the search query update
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSearchQuery(value);
      }, 200);
    },
    [setSearchQuery],
  );

  const handleClear = useCallback(() => {
    setLocalValue('');
    setSearchQuery('');
  }, [setSearchQuery]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="inkwell-search-bar">
      <input
        type="search"
        className="inkwell-search-input"
        placeholder="Search documents..."
        value={localValue}
        onChange={handleChange}
        aria-label="Search documents"
      />
      {localValue && (
        <button
          className="inkwell-search-clear"
          onClick={handleClear}
          aria-label="Clear search"
        >
          &times;
        </button>
      )}
    </div>
  );
}
