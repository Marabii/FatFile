import React, { useState, useCallback } from "react";

interface SearchBarProps {
  onSearch: (pattern: string) => void;
  isSearching: boolean;
  searchProgress: number;
  totalResults: number;
  searchComplete: boolean;
  fileName: string;
  lineCount: number;
}

// Escape special regex characters for literal search
const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  isSearching,
  searchProgress,
  totalResults,
  searchComplete,
  fileName,
  lineCount,
}) => {
  const [searchText, setSearchText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regexMode, setRegexMode] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (searchText.trim() && !isSearching) {
        let pattern = searchText.trim();

        // If not in regex mode, escape special characters for literal search
        if (!regexMode) {
          pattern = escapeRegex(pattern);
        }

        // Add case insensitivity flag if needed
        if (!caseSensitive) {
          pattern = `(?i)${pattern}`;
        }

        onSearch(pattern);
      }
    },
    [searchText, isSearching, onSearch, caseSensitive, regexMode]
  );

  return (
    <div
      className="flex flex-col border-t"
      style={{
        borderColor: "var(--vscode-panel-border)",
        backgroundColor: "var(--vscode-statusBar-background)",
      }}
    >
      {/* Progress bar when searching */}
      {isSearching && (
        <div
          style={{
            height: "3px",
            backgroundColor: "var(--vscode-input-background)",
          }}
        >
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${searchProgress}%`,
              backgroundColor: "var(--vscode-button-background)",
            }}
          />
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-3 px-4 py-2"
      >
        {/* File info on the left */}
        <div
          className="flex items-center gap-4 text-xs"
          style={{ color: "var(--vscode-statusBar-foreground)" }}
        >
          <span className="font-semibold">{fileName}</span>
          <span className="opacity-70">{lineCount.toLocaleString()} lines</span>
        </div>

        {/* Search controls in the middle */}
        <div className="flex-1 flex items-center gap-2 max-w-xl">
          <div className="flex-1 relative flex items-center gap-1">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={
                regexMode
                  ? "Search with regex (e.g., error|warning)"
                  : "Search for text"
              }
              disabled={isSearching}
              className="w-full px-2 py-1 text-xs rounded outline-none disabled:opacity-50"
              style={{
                backgroundColor: "var(--vscode-input-background)",
                color: "var(--vscode-input-foreground)",
                border: "1px solid var(--vscode-input-border)",
                caretColor: "var(--vscode-input-foreground)",
              }}
            />

            {/* Toggle buttons inside/next to input */}
            <button
              type="button"
              onClick={() => setCaseSensitive(!caseSensitive)}
              disabled={isSearching}
              title={
                caseSensitive ? "Case sensitive (on)" : "Case insensitive (off)"
              }
              className="px-2 py-1 text-xs rounded font-mono transition-colors disabled:opacity-30"
              style={{
                backgroundColor: caseSensitive
                  ? "var(--vscode-button-background)"
                  : "transparent",
                color: caseSensitive
                  ? "var(--vscode-button-foreground)"
                  : "var(--vscode-statusBar-foreground)",
                border: "1px solid var(--vscode-input-border)",
                opacity: caseSensitive ? 1 : 0.6,
              }}
            >
              Aa
            </button>

            <button
              type="button"
              onClick={() => setRegexMode(!regexMode)}
              disabled={isSearching}
              title={regexMode ? "Regex mode (on)" : "Literal search (off)"}
              className="px-2 py-1 text-xs rounded font-mono transition-colors disabled:opacity-30"
              style={{
                backgroundColor: regexMode
                  ? "var(--vscode-button-background)"
                  : "transparent",
                color: regexMode
                  ? "var(--vscode-button-foreground)"
                  : "var(--vscode-statusBar-foreground)",
                border: "1px solid var(--vscode-input-border)",
                opacity: regexMode ? 1 : 0.6,
              }}
            >
              .*
            </button>
          </div>

          <button
            type="submit"
            disabled={isSearching || !searchText.trim()}
            className="px-3 py-1 text-xs rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: "var(--vscode-button-background)",
              color: "var(--vscode-button-foreground)",
            }}
            onMouseEnter={(e) => {
              if (!isSearching && searchText.trim()) {
                e.currentTarget.style.backgroundColor =
                  "var(--vscode-button-hoverBackground)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor =
                "var(--vscode-button-background)";
            }}
          >
            {isSearching ? (
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {searchProgress}%
              </span>
            ) : (
              "Search"
            )}
          </button>
        </div>

        {/* Results on the right */}
        {totalResults > 0 && (
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--vscode-statusBar-foreground)" }}
          >
            <span className="opacity-70">
              {totalResults.toLocaleString()} matches
            </span>
            {!searchComplete && (
              <span style={{ color: "var(--vscode-editorWarning-foreground)" }}>
                (limit)
              </span>
            )}
          </div>
        )}
      </form>
    </div>
  );
};
