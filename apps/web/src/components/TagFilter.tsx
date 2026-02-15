'use client';

/**
 * TagFilter Component
 *
 * Horizontal chip bar showing all available tags.
 * Clicking a tag toggles it in the active filter.
 * Multiple tags active = AND filter.
 */

import { useDocumentStore } from '@/lib/document-store';
import { tagColor } from '@/lib/document-utils';

export function TagFilter() {
  const { getAllTags, activeTagFilters, setActiveTagFilters } = useDocumentStore();
  const allTags = getAllTags();

  if (allTags.length === 0) return null;

  const handleTagClick = (tag: string) => {
    if (activeTagFilters.includes(tag)) {
      setActiveTagFilters(activeTagFilters.filter((t) => t !== tag));
    } else {
      setActiveTagFilters([...activeTagFilters, tag]);
    }
  };

  const handleClearAll = () => {
    setActiveTagFilters([]);
  };

  return (
    <div className="inkwell-tag-filter" role="group" aria-label="Filter by tags">
      {activeTagFilters.length > 0 && (
        <button
          className="inkwell-tag-chip inkwell-tag-chip-clear"
          onClick={handleClearAll}
          aria-label="Clear tag filters"
        >
          All
        </button>
      )}
      {allTags.map((tag) => {
        const isActive = activeTagFilters.includes(tag);
        return (
          <button
            key={tag}
            className={`inkwell-tag-chip ${isActive ? 'inkwell-tag-chip-active' : ''}`}
            onClick={() => handleTagClick(tag)}
            aria-pressed={isActive}
            style={{
              '--tag-color': tagColor(tag),
            } as React.CSSProperties}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
