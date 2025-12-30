import React, { useEffect, useState, useCallback, useRef } from 'react';
import { LogViewer, type LogViewerRef } from './components/LogViewer';
import { SearchBar } from './components/SearchBar';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ParsingPreviewPanel } from './components/ParsingPreviewPanel';
import type {
  Response,
  SearchMatch,
  ExtensionMessage,
  LogFormat
} from '../types';

interface AppState {
  filePath: string | null;
  lineCount: number;
  chunks: Map<number, string[][]>;
  searchResults: SearchMatch[];
  searchProgress: number;
  searchComplete: boolean;
  isSearching: boolean;
  isLoading: boolean;
  error: string | null;
  encoding: string | null;
  encodingSupported: boolean;
  logFormat: LogFormat | null;
  showParsingConfig: boolean;
  previewLines: string[][];
  isParsed: boolean;
  parsingColumns: number | null;
}

declare const acquireVsCodeApi: () => {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

const vscode = acquireVsCodeApi();

export const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    filePath: null,
    lineCount: 0,
    chunks: new Map(),
    searchResults: [],
    searchProgress: 0,
    searchComplete: true,
    isSearching: false,
    isLoading: false,
    error: null,
    encoding: null,
    encodingSupported: true,
    logFormat: null,
    showParsingConfig: false,
    previewLines: [],
    isParsed: false,
    parsingColumns: null,
  });

  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [highlightedLine, setHighlightedLine] = useState<number | undefined>();
  const mainViewerRef = useRef<LogViewerRef>(null);

  const handleResponse = useCallback((response: Response) => {
    console.log('[WEBVIEW] Handling response:', response);

    if ('Encoding' in response) {
      console.log('[WEBVIEW] Received encoding response:', response.Encoding);
      setState(prev => ({
        ...prev,
        encoding: response.Encoding.encoding,
        encodingSupported: response.Encoding.is_supported
      }));
    } else if ('FileOpened' in response) {
      console.log('[WEBVIEW] Received FileOpened response:', response.FileOpened);
      setState(prev => ({
        ...prev,
        lineCount: response.FileOpened.line_count,
        error: null
      }));
    } else if ('Chunk' in response) {
      console.log('[WEBVIEW] Received Chunk response:', response.Chunk);
      setState(prev => {
        // If we don't have preview lines yet and haven't configured parsing,
        // use this chunk as the preview (taking only first 10 lines)
        const needsPreview = prev.previewLines.length === 0 && !prev.showParsingConfig && !prev.isParsed;
        console.log('[WEBVIEW] Needs preview?', needsPreview, {
          previewLinesLength: prev.previewLines.length,
          showParsingConfig: prev.showParsingConfig,
          isParsed: prev.isParsed
        });

        if (needsPreview) {
          console.log('[WEBVIEW] Storing as preview chunk, taking first 10 lines from', response.Chunk.data.length, 'lines');
          return {
            ...prev,
            previewLines: response.Chunk.data.slice(0, 10)
          };
        } else {
          // Regular chunk for viewing
          console.log('[WEBVIEW] Storing regular chunk at line', response.Chunk.start_line, 'with', response.Chunk.data.length, 'lines');
          console.log('[WEBVIEW] First line of chunk:', response.Chunk.data[0]);
          console.log('[WEBVIEW] isParsed=', prev.isParsed, 'parsingColumns=', prev.parsingColumns);
          const newChunks = new Map(prev.chunks);
          newChunks.set(response.Chunk.start_line, response.Chunk.data);
          return {
            ...prev,
            chunks: newChunks,
            isLoading: false
          };
        }
      });
    } else if ('ParsingInformation' in response) {
      console.log('[WEBVIEW] Received ParsingInformation response:', response.ParsingInformation);
      setState(prev => {
        // If we have parsingColumns set, this is a confirmation after applying parsing
        if (prev.parsingColumns !== null) {
          console.log('[WEBVIEW] Parsing confirmed, clearing chunks and setting isParsed=true');
          return {
            ...prev,
            logFormat: response.ParsingInformation.log_format,
            isParsed: true,
            showParsingConfig: false,
            isLoading: false,
            chunks: new Map() // Clear chunks NOW so they reload as parsed
            // Keep previewLines - no longer needed but clearing it triggers unwanted requests
          };
        }
        // If we haven't shown the config yet, show it now (initial detection)
        else if (!prev.showParsingConfig && !prev.isParsed) {
          console.log('[WEBVIEW] Showing parsing config panel!');
          return {
            ...prev,
            logFormat: response.ParsingInformation.log_format,
            showParsingConfig: true,
            isLoading: false
          };
        }
        // Otherwise just update the format
        else {
          console.log('[WEBVIEW] Updating log format');
          return {
            ...prev,
            logFormat: response.ParsingInformation.log_format,
            isLoading: false
          };
        }
      });
    } else if ('SearchResults' in response) {
      setState(prev => ({
        ...prev,
        searchResults: response.SearchResults.matches,
        searchComplete: response.SearchResults.search_complete,
        isSearching: false,
        searchProgress: 100
      }));
    } else if ('Progress' in response) {
      setState(prev => ({
        ...prev,
        searchProgress: response.Progress.percent
      }));
    } else if ('Error' in response) {
      setState(prev => ({
        ...prev,
        error: response.Error.message,
        isLoading: false,
        isSearching: false
      }));
    } else if ('Info' in response) {
      console.log('[WEBVIEW] Backend info:', response.Info.message);
    }
  }, []);

  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data as ExtensionMessage;
      console.log('[WEBVIEW] <<<< Received message from extension:', message);

      if (message.type === 'init') {
        const filePath = message.filePath;
        console.log('[WEBVIEW] Initializing with file:', filePath);
        setState(prev => ({
          ...prev,
          filePath,
          isLoading: true
        }));

        // Start the initialization flow: GetFileEncoding -> OpenFile -> GetChunk -> GetParsingInformation
        console.log('[WEBVIEW] >>>> Sending GetFileEncoding command:', { path: filePath });
        vscode.postMessage({
          type: 'getFileEncoding',
          path: filePath
        });
      } else if (message.type === 'response') {
        console.log('[WEBVIEW] Got response message, calling handleResponse with:', message.data);
        handleResponse(message.data);
      } else if (message.type === 'error') {
        console.log('[WEBVIEW] Got error message:', message.message);
        setState(prev => ({
          ...prev,
          error: message.message,
          isLoading: false,
          isSearching: false
        }));
      }
    };

    console.log('[WEBVIEW] Setting up message listener');
    window.addEventListener('message', messageHandler);
    return () => {
      console.log('[WEBVIEW] Removing message listener');
      window.removeEventListener('message', messageHandler);
    };
  }, [handleResponse]);

  const handleGetChunk = useCallback((startLine: number, endLine: number) => {
    vscode.postMessage({
      type: 'getChunk',
      start_line: startLine,
      end_line: endLine
    });
  }, []);

  const handleSearch = useCallback((pattern: string) => {
    setState(prev => ({
      ...prev,
      isSearching: true,
      searchProgress: 0,
      searchResults: []
    }));

    vscode.postMessage({
      type: 'search',
      pattern
    });
  }, []);

  const handleApplyParsing = useCallback((logFormat: LogFormat, pattern?: string, nbrColumns?: number) => {
    console.log('[WEBVIEW] Applying parsing with format:', logFormat, 'pattern:', pattern, 'columns:', nbrColumns);

    // Determine the number of columns for this format
    const columns = nbrColumns || (logFormat !== 'Other' ? (
      logFormat === 'CommonEventFormat' || logFormat === 'SyslogRFC5424' || logFormat === 'CommonLogFormat' ? 8 : 5
    ) : 0);

    setState(prev => ({
      ...prev,
      isLoading: true,
      showParsingConfig: false, // Hide modal immediately
      parsingColumns: columns // Store the number of columns
    }));

    vscode.postMessage({
      type: 'parseFile',
      log_format: logFormat,
      pattern,
      nbr_columns: nbrColumns
    });
  }, []);

  const handleSkipParsing = useCallback(() => {
    console.log('Skipping parsing');

    setState(prev => ({
      ...prev,
      showParsingConfig: false,
      isParsed: false,
      isLoading: false
    }));
  }, []);

  // After receiving encoding, open the file
  useEffect(() => {
    console.log('[WEBVIEW] useEffect[encoding]: encoding=', state.encoding, 'filePath=', state.filePath);
    if (state.encoding && state.filePath) {
      console.log('[WEBVIEW] >>>> Encoding received, opening file:', state.filePath);
      vscode.postMessage({
        type: 'openFile',
        path: state.filePath
      });
    }
  }, [state.encoding, state.filePath]);

  // After file is opened, get first 10 lines for preview
  useEffect(() => {
    console.log('[WEBVIEW] useEffect[lineCount]: lineCount=', state.lineCount, 'previewLines.length=', state.previewLines.length, 'parsingColumns=', state.parsingColumns);
    // Only request preview if we haven't started parsing yet
    if (state.lineCount > 0 && state.previewLines.length === 0 && state.parsingColumns === null) {
      console.log('[WEBVIEW] >>>> File opened, getting preview chunk');
      vscode.postMessage({
        type: 'getChunk',
        start_line: 0,
        end_line: 10
      });
    }
  }, [state.lineCount, state.previewLines.length, state.parsingColumns]);

  // After preview lines are received, get parsing information
  useEffect(() => {
    console.log('[WEBVIEW] useEffect[previewLines]: previewLines.length=', state.previewLines.length, 'logFormat=', state.logFormat, 'showParsingConfig=', state.showParsingConfig);
    if (state.previewLines.length > 0 && !state.logFormat && !state.showParsingConfig) {
      console.log('[WEBVIEW] >>>> Preview lines received, getting parsing information');
      vscode.postMessage({
        type: 'getParsingInformation'
      });
    }
  }, [state.previewLines.length, state.logFormat, state.showParsingConfig]);

  // Show encoding warning when encoding is not supported
  useEffect(() => {
    if (state.encoding && !state.encodingSupported) {
      // Send a message to the extension to show a VSCode warning
      vscode.postMessage({
        type: 'showEncodingWarning',
        encoding: state.encoding
      });
    }
  }, [state.encoding, state.encodingSupported]);

  // Show results panel when search completes with results
  useEffect(() => {
    if (state.searchResults.length > 0 && !state.isSearching) {
      setShowResultsPanel(true);
    }
  }, [state.searchResults.length, state.isSearching]);

  // Build filtered chunks containing only search result lines, re-indexed from 0
  const [searchResultData, setSearchResultData] = useState<{
    chunks: Map<number, string[][]>;
    lineCount: number;
    lineMapping: Map<number, number>; // virtual index -> actual line number
  }>({ chunks: new Map(), lineCount: 0, lineMapping: new Map() });

  useEffect(() => {
    if (state.searchResults.length === 0) {
      setSearchResultData({ chunks: new Map(), lineCount: 0, lineMapping: new Map() });
      return;
    }

    const CHUNK_SIZE = 100;
    const filteredChunks = new Map<number, string[][]>();
    const lineMapping = new Map<number, number>();

    // Sort results by line number
    const sortedResults = [...state.searchResults].sort((a, b) => a.line_number - b.line_number);

    // First, identify which chunks we need and request missing ones
    const neededChunks = new Set<number>();
    for (const result of sortedResults) {
      const chunkStart = Math.floor(result.line_number / CHUNK_SIZE) * CHUNK_SIZE;
      neededChunks.add(chunkStart);
    }

    // Request any missing chunks
    const missingChunks: number[] = [];
    for (const chunkStart of neededChunks) {
      if (!state.chunks.has(chunkStart)) {
        missingChunks.push(chunkStart);
      }
    }

    // If there are missing chunks, request them
    if (missingChunks.length > 0) {
      console.log('[App] Requesting missing chunks for search results:', missingChunks);
      for (const chunkStart of missingChunks) {
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, state.lineCount);
        handleGetChunk(chunkStart, chunkEnd);
      }
      // Don't build search result data yet - wait for chunks to load
      return;
    }

    let virtualIndex = 0;

    // Build chunks with re-indexed lines
    for (const result of sortedResults) {
      const originalLineNumber = result.line_number;
      const originalChunkStart = Math.floor(originalLineNumber / CHUNK_SIZE) * CHUNK_SIZE;
      const originalChunk = state.chunks.get(originalChunkStart);

      if (originalChunk) {
        const lineIndexInChunk = originalLineNumber - originalChunkStart;
        const lineData = originalChunk[lineIndexInChunk];

        if (lineData) {
          // Map virtual index to actual line number
          lineMapping.set(virtualIndex, originalLineNumber);

          // Add to virtual chunk
          const virtualChunkStart = Math.floor(virtualIndex / CHUNK_SIZE) * CHUNK_SIZE;
          if (!filteredChunks.has(virtualChunkStart)) {
            filteredChunks.set(virtualChunkStart, []);
          }
          filteredChunks.get(virtualChunkStart)!.push(lineData);

          virtualIndex++;
        }
      }
    }

    console.log('[App] Built search result data:', { lineCount: sortedResults.length, chunks: filteredChunks.size });
    setSearchResultData({
      chunks: filteredChunks,
      lineCount: sortedResults.length,
      lineMapping
    });
  }, [state.searchResults, state.chunks, handleGetChunk, state.lineCount]);

  // Handler to navigate from results panel to main view
  const handleResultLineClick = useCallback((virtualLineNumber: number) => {
    // Map virtual line number to actual line number
    const actualLineNumber = searchResultData.lineMapping.get(virtualLineNumber);
    if (actualLineNumber !== undefined) {
      setHighlightedLine(actualLineNumber);
      // Scroll main viewer to this line
      if (mainViewerRef.current) {
        mainViewerRef.current.goToLine(actualLineNumber + 1);
      }
    }
  }, [searchResultData.lineMapping]);

  // Handler to close results panel
  const handleCloseResults = useCallback(() => {
    setShowResultsPanel(false);
    setHighlightedLine(undefined);
  }, []);

  if (state.isLoading && state.lineCount === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <LoadingSpinner message="Opening file..." />
      </div>
    );
  }

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

  if (!state.filePath) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <LoadingSpinner message="Initializing..." />
      </div>
    );
  }

  console.log('[WEBVIEW] RENDER: state=', {
    showParsingConfig: state.showParsingConfig,
    logFormat: state.logFormat,
    previewLinesLength: state.previewLines.length,
    isParsed: state.isParsed,
    lineCount: state.lineCount,
    encoding: state.encoding
  });

  return (
    <div className="flex flex-col w-full h-full">
      {/* Main content area - viewers */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Main log viewer */}
        <div className="flex flex-col overflow-hidden" style={{ height: showResultsPanel ? '50%' : '100%' }}>
          <LogViewer
            ref={mainViewerRef}
            lineCount={state.lineCount}
            chunks={state.chunks}
            searchResults={state.searchResults}
            onGetChunk={handleGetChunk}
            nbrColumns={state.isParsed && state.parsingColumns ? state.parsingColumns : undefined}
            highlightedLine={highlightedLine}
          />
        </div>

        {/* Search results panel */}
        {showResultsPanel && searchResultData.lineCount > 0 && (
          <div className="flex flex-col overflow-hidden border-t" style={{ height: '50%', borderColor: 'var(--vscode-panel-border)' }}>
            <LogViewer
              lineCount={searchResultData.lineCount}
              chunks={searchResultData.chunks}
              searchResults={state.searchResults}
              onGetChunk={() => {}} // No chunk loading needed for results
              nbrColumns={state.isParsed && state.parsingColumns ? state.parsingColumns : undefined}
              onLineClick={handleResultLineClick}
              showHeader={true}
              onClose={handleCloseResults}
              title={`Search Results (${state.searchResults.length} matches)`}
            />
          </div>
        )}
      </div>

      {/* Search bar at bottom */}
      <SearchBar
        onSearch={handleSearch}
        isSearching={state.isSearching}
        searchProgress={state.searchProgress}
        totalResults={state.searchResults.length}
        searchComplete={state.searchComplete}
        fileName={state.filePath.split('/').pop() || ''}
        lineCount={state.lineCount}
      />

      {/* Show parsing configuration modal as overlay */}
      {state.showParsingConfig && state.logFormat && (() => {
        console.log('[WEBVIEW] RENDERING MODAL WITH:', state.logFormat, state.previewLines.length);
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
