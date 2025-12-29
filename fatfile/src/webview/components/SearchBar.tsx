import React, { useState, useCallback } from 'react';

interface SearchBarProps {
  onSearch: (pattern: string) => void;
  isSearching: boolean;
  searchProgress: number;
  totalResults: number;
  searchComplete: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  isSearching,
  searchProgress,
  totalResults,
  searchComplete
}) => {
  const [searchText, setSearchText] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchText.trim() && !isSearching) {
      onSearch(searchText.trim());
    }
  }, [searchText, isSearching, onSearch]);

  return (
    <div className="flex flex-col border-b" style={{ borderColor: 'var(--vscode-panel-border)' }}>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search with regex pattern (e.g., error|warning)"
            disabled={isSearching}
            className="w-full px-3 py-2 text-sm rounded outline-none focus:ring-1 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border)',
              caretColor: 'var(--vscode-input-foreground)'
            }}
          />
        </div>

        <button
          type="submit"
          disabled={isSearching || !searchText.trim()}
          className="px-4 py-2 text-sm rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)'
          }}
          onMouseEnter={(e) => {
            if (!isSearching && searchText.trim()) {
              e.currentTarget.style.backgroundColor = 'var(--vscode-button-hoverBackground)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--vscode-button-background)';
          }}
        >
          {isSearching ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Searching...
            </span>
          ) : (
            'Search'
          )}
        </button>
      </form>

      {isSearching && (
        <div className="px-3 pb-3">
          <div className="relative w-full h-2 rounded overflow-hidden" style={{ backgroundColor: 'var(--vscode-input-background)' }}>
            <div
              className="absolute top-0 left-0 h-full transition-all duration-300"
              style={{
                width: `${searchProgress}%`,
                backgroundColor: 'var(--vscode-button-background)'
              }}
            />
          </div>
          <div className="text-xs mt-1 opacity-70">{searchProgress}% complete</div>
        </div>
      )}

      {!isSearching && totalResults > 0 && (
        <div className="px-3 pb-3 text-sm">
          <span className="opacity-70">Found </span>
          <span className="font-semibold">{totalResults.toLocaleString()}</span>
          <span className="opacity-70"> matches</span>
          {!searchComplete && (
            <span className="ml-2 text-yellow-500">(stopped at limit)</span>
          )}
        </div>
      )}
    </div>
  );
};
