'use client';

/**
 * TagInput Component
 *
 * Inline tag editor for a document.
 * Supports adding/removing tags with autocomplete.
 */

import { useState, useCallback, useRef } from 'react';
import { useDocumentStore } from '@/lib/document-store';
import { tagColor } from '@/lib/document-utils';

interface TagInputProps {
  documentId: string;
  tags: string[];
}

export function TagInput({ documentId, tags }: TagInputProps) {
  const { setTags, getAllTags } = useDocumentStore();
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allTags = getAllTags();
  const suggestions = allTags
    .filter((t) => !tags.includes(t) && t.toLowerCase().includes(inputValue.toLowerCase()))
    .slice(0, 5);

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim().toLowerCase();
      if (!trimmed || tags.includes(trimmed)) return;
      setTags(documentId, [...tags, trimmed]);
      setInputValue('');
      setShowSuggestions(false);
    },
    [documentId, tags, setTags],
  );

  const removeTag = useCallback(
    (tag: string) => {
      setTags(documentId, tags.filter((t) => t !== tag));
    },
    [documentId, tags, setTags],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && inputValue.trim()) {
        e.preventDefault();
        addTag(inputValue);
      } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
        removeTag(tags[tags.length - 1]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    },
    [inputValue, addTag, removeTag, tags],
  );

  return (
    <div className="inkwell-tag-input-container">
      <div className="inkwell-tag-input-tags">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inkwell-tag-badge"
            style={{ '--tag-color': tagColor(tag) } as React.CSSProperties}
          >
            {tag}
            <button
              className="inkwell-tag-remove"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              aria-label={`Remove tag ${tag}`}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="inkwell-tag-input"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={tags.length === 0 ? 'Add tags...' : ''}
          aria-label="Add tag"
        />
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div className="inkwell-tag-suggestions" role="listbox">
          {suggestions.map((tag) => (
            <button
              key={tag}
              className="inkwell-tag-suggestion"
              role="option"
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(tag);
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
