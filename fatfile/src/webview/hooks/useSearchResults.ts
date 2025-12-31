import { useState, useEffect, useCallback, useMemo } from "react";
import type { AppState } from "../types/appState";
import { CHUNK_SIZE } from "../config/constants";

interface SearchResultData {
  chunks: Map<number, string[][]>;
  lineCount: number;
  lineMapping: Map<number, number>; // virtual index -> actual line number
}

interface UseSearchResultsProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onGetChunk: (startLine: number, endLine: number) => void;
}

/**
 * Hook to manage search results with lazy loading
 * Only loads lines that are visible in the viewport
 */
export const useSearchResults = ({
  state,
  setState,
  onGetChunk,
}: UseSearchResultsProps) => {
  const [showResultsPanel, setShowResultsPanel] = useState(false);

  // Show results panel when search completes with results
  useEffect(() => {
    if (state.searchResults.length > 0 && !state.isSearching) {
      setShowResultsPanel(true);
    }
  }, [state.searchResults.length, state.isSearching]);

  // Sort and memoize search results
  const sortedResults = useMemo(() => {
    return [...state.searchResults].sort((a, b) => a.line_number - b.line_number);
  }, [state.searchResults]);

  // Build virtual chunks from loaded search lines (on-demand)
  const searchResultData = useMemo<SearchResultData>(() => {
    if (sortedResults.length === 0) {
      return {
        chunks: new Map(),
        lineCount: 0,
        lineMapping: new Map(),
      };
    }

    const filteredChunks = new Map<number, string[][]>();
    const lineMapping = new Map<number, number>();
    let virtualIndex = 0;

    // Build chunks only from lines that are already loaded
    for (const result of sortedResults) {
      const originalLineNumber = result.line_number;
      const lineChunk = state.searchLines.get(originalLineNumber);

      if (lineChunk && lineChunk.length > 0) {
        const lineData = lineChunk[0];
        lineMapping.set(virtualIndex, originalLineNumber);

        // Add to virtual chunk
        const virtualChunkStart =
          Math.floor(virtualIndex / CHUNK_SIZE) * CHUNK_SIZE;
        if (!filteredChunks.has(virtualChunkStart)) {
          filteredChunks.set(virtualChunkStart, []);
        }
        filteredChunks.get(virtualChunkStart)!.push(lineData);
      }

      virtualIndex++;
    }

    return {
      chunks: filteredChunks,
      lineCount: sortedResults.length,
      lineMapping,
    };
  }, [sortedResults, state.searchLines]);

  // Custom chunk handler for search results - translates virtual to actual lines
  const handleSearchChunkRequest = useCallback(
    (virtualStart: number, virtualEnd: number) => {
      console.log(
        "[useSearchResults] Requesting virtual chunk:",
        virtualStart,
        "->",
        virtualEnd
      );

      // Get the actual line numbers for this virtual range
      for (let i = virtualStart; i < virtualEnd && i < sortedResults.length; i++) {
        const actualLineNumber = sortedResults[i].line_number;

        // Only request if we don't have it already
        if (!state.searchLines.has(actualLineNumber)) {
          console.log(
            "[useSearchResults] Requesting actual line:",
            actualLineNumber,
            "for virtual index:",
            i
          );
          onGetChunk(actualLineNumber, actualLineNumber);
        }
      }
    },
    [sortedResults, state.searchLines, onGetChunk]
  );

  const handleCloseResults = useCallback(() => {
    setShowResultsPanel(false);
    // Clear search data when panel closes to free memory
    setState((prev) => ({
      ...prev,
      searchLines: new Map(),
      searchResults: [], // Clear search results
    }));
    console.log("[useSearchResults] Cleared search data on panel close");
  }, [setState]);

  return {
    showResultsPanel,
    searchResultData,
    handleCloseResults,
    handleSearchChunkRequest,
  };
};
