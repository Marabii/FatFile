import React, { useState, useCallback, useRef, useMemo } from "react";
import { LogViewer, type LogViewerRef } from "./components/LogViewer";
import { SearchBar } from "./components/SearchBar";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { ParsingPreviewPanel } from "./components/ParsingPreviewPanel";
import { initialAppState } from "./types/appState";
import { ChunkManager } from "./services/chunkManager";
import { useMessageHandler } from "./hooks/useMessageHandler";
import { useFileInitialization } from "./hooks/useFileInitialization";
import { useEventHandlers } from "./hooks/useEventHandlers";
import { useSearchResults } from "./hooks/useSearchResults";

declare const acquireVsCodeApi: () => {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

const vscode = acquireVsCodeApi();

export const App: React.FC = () => {
  const [state, setState] = useState(initialAppState);
  const [highlightedLine, setHighlightedLine] = useState<number | undefined>();
  const [isLiveTailActive, setIsLiveTailActive] = useState(false);
  const mainViewerRef = useRef<LogViewerRef>(null);

  // Create chunk manager instance (persists across renders)
  const chunkManager = useMemo(() => new ChunkManager(), []);

  // Handle responses from backend
  const handleResponse = useMessageHandler({ chunkManager, setState });

  // Handle file initialization flow
  useFileInitialization({
    vscode,
    state,
    setState,
    chunkManager,
    handleResponse,
  });

  // Event handlers
  const { handleGetChunk, handleSearch, handleApplyParsing, handleSkipParsing } =
    useEventHandlers({ vscode, setState });

  // Search results processing
  const {
    showResultsPanel,
    searchResultData,
    handleCloseResults,
    handleSearchChunkRequest,
  } = useSearchResults({
    state,
    setState,
    onGetChunk: handleGetChunk,
  });

  // Handler to navigate from results panel to main view
  const handleResultLineClick = useCallback(
    (virtualLineNumber: number) => {
      // Map virtual line number to actual line number
      const actualLineNumber =
        searchResultData.lineMapping.get(virtualLineNumber);
      if (actualLineNumber !== undefined) {
        setHighlightedLine(actualLineNumber);
        // Scroll main viewer to this line
        if (mainViewerRef.current) {
          mainViewerRef.current.goToLine(actualLineNumber + 1);
        }
      }
    },
    [searchResultData.lineMapping]
  );

  // Wrap handleCloseResults to also reset highlighting
  const handleCloseResultsWithReset = useCallback(() => {
    handleCloseResults();
    setHighlightedLine(undefined); // Reset highlighting
  }, [handleCloseResults]);

  // Toggle Live Tail mode
  const handleToggleLiveTail = useCallback(() => {
    setIsLiveTailActive((prev) => !prev);
  }, []);

  // Mark chunk as accessed (for LRU tracking)
  const handleChunkAccessed = useCallback(
    (chunkStart: number) => {
      chunkManager.markAccessed(state.chunks, chunkStart);
    },
    [chunkManager, state.chunks]
  );

  // Loading state
  if (state.isLoading && state.lineCount === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <LoadingSpinner message="Opening file..." />
      </div>
    );
  }

  // Error state
  if (state.error) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-center p-8">
          <div className="text-red-500 text-xl mb-4">Error</div>
          <div className="text-sm opacity-80">{state.error}</div>
        </div>
      </div>
    );
  }

  // Initialization state
  if (!state.filePath) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <LoadingSpinner message="Initializing..." />
      </div>
    );
  }

  console.log("[WEBVIEW] RENDER: state=", {
    showParsingConfig: state.showParsingConfig,
    logFormat: state.logFormat,
    previewLinesLength: state.previewLines.length,
    isParsed: state.isParsed,
    lineCount: state.lineCount,
    encoding: state.encoding,
  });

  return (
    <div className="flex flex-col w-full h-full">
      {/* Main content area - viewers */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Main log viewer */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ height: showResultsPanel ? "50%" : "100%" }}
        >
          <LogViewer
            ref={mainViewerRef}
            lineCount={state.lineCount}
            chunks={state.chunks}
            searchResults={state.searchResults}
            onGetChunk={handleGetChunk}
            nbrColumns={
              state.isParsed && state.parsingColumns
                ? state.parsingColumns
                : undefined
            }
            highlightedLine={highlightedLine}
            onChunkAccessed={handleChunkAccessed}
            isLiveTailActive={isLiveTailActive}
          />
        </div>

        {/* Search results panel */}
        {showResultsPanel && searchResultData.lineCount > 0 && (
          <div
            className="flex flex-col overflow-hidden border-t"
            style={{ height: "50%", borderColor: "var(--vscode-panel-border)" }}
          >
            <LogViewer
              lineCount={searchResultData.lineCount}
              chunks={searchResultData.chunks}
              searchResults={state.searchResults}
              onGetChunk={handleSearchChunkRequest} // Lazy load search result lines
              nbrColumns={
                state.isParsed && state.parsingColumns
                  ? state.parsingColumns
                  : undefined
              }
              onLineClick={handleResultLineClick}
              showHeader={true}
              onClose={handleCloseResultsWithReset}
              title={`Search Results (${state.searchResults.length} matches)`}
              onChunkAccessed={handleChunkAccessed}
            />
          </div>
        )}
      </div>

      {/* Bottom toolbar with Live Tail and Search bar */}
      <div
        className="flex items-center gap-3 border-t"
        style={{
          borderColor: "var(--vscode-panel-border)",
          backgroundColor: "var(--vscode-statusBar-background)",
          paddingLeft: "16px",
        }}
      >
        {/* Live Tail button */}
        <button
          onClick={handleToggleLiveTail}
          className="px-3 py-1 text-xs rounded transition-all flex items-center gap-2"
          style={{
            backgroundColor: isLiveTailActive
              ? "var(--vscode-button-background)"
              : "var(--vscode-button-secondaryBackground)",
            color: isLiveTailActive
              ? "var(--vscode-button-foreground)"
              : "var(--vscode-button-secondaryForeground)",
            border: isLiveTailActive
              ? "1px solid var(--vscode-button-border)"
              : "1px solid var(--vscode-button-border)",
            fontWeight: isLiveTailActive ? 600 : 400,
          }}
          title={
            isLiveTailActive
              ? "Disable Live Tail mode"
              : "Enable Live Tail mode - automatically scroll to new lines"
          }
        >
          {isLiveTailActive ? (
            <>
              <span style={{ color: "#4EC9B0" }}>●</span>
              Live Tail
            </>
          ) : (
            <>
              <span style={{ opacity: 0.5 }}>○</span>
              Live Tail
            </>
          )}
        </button>

        {/* Search bar */}
        <div className="flex-1">
          <SearchBar
            onSearch={handleSearch}
            isSearching={state.isSearching}
            searchProgress={state.searchProgress}
            totalResults={state.searchResults.length}
            searchComplete={state.searchComplete}
            fileName={state.filePath.split("/").pop() || ""}
            lineCount={state.lineCount}
          />
        </div>
      </div>

      {/* Show parsing configuration modal as overlay */}
      {state.showParsingConfig &&
        state.logFormat &&
        (() => {
          console.log(
            "[WEBVIEW] RENDERING MODAL WITH:",
            state.logFormat,
            state.previewLines.length
          );
          return (
            <ParsingPreviewPanel
              logFormat={state.logFormat}
              previewLines={state.previewLines}
              onApply={handleApplyParsing}
              onSkip={handleSkipParsing}
            />
          );
        })()}
    </div>
  );
};
