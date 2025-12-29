import React, { useEffect, useState, useCallback } from 'react';
import { LogViewer } from './components/LogViewer';
import { SearchBar } from './components/SearchBar';
import { StatusBar } from './components/StatusBar';
import { LoadingSpinner } from './components/LoadingSpinner';
import type {
  Response,
  SearchMatch,
  ExtensionMessage
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
  pattern?: string;
  nbrColumns?: number;
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
  });

  const handleResponse = useCallback((response: Response) => {
    if ('FileOpened' in response) {
      setState(prev => ({
        ...prev,
        lineCount: response.FileOpened.line_count,
        isLoading: false,
        error: null
      }));
    } else if ('Chunk' in response) {
      setState(prev => {
        const newChunks = new Map(prev.chunks);
        newChunks.set(response.Chunk.start_line, response.Chunk.data);
        return {
          ...prev,
          chunks: newChunks,
          isLoading: false
        };
      });
    } else if ('SearchResults' in response) {
      setState(prev => ({
        ...prev,
        searchResults: response.SearchResults.matches,
        searchComplete: response.SearchResults.search_complete,
        isSearching: false,
        searchProgress: 100
      }));
    } else if ('SearchProgress' in response) {
      setState(prev => ({
        ...prev,
        searchProgress: response.SearchProgress.percent
      }));
    } else if ('Error' in response) {
      setState(prev => ({
        ...prev,
        error: response.Error.message,
        isLoading: false,
        isSearching: false
      }));
    } else if ('Info' in response) {
      console.log('Backend info:', response.Info.message);
    }
  }, []);

  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data as ExtensionMessage;
      console.log('Received message from extension:', message);

      if (message.type === 'init') {
        const filePath = message.filePath;
        console.log('Initializing with file:', filePath);
        setState(prev => ({
          ...prev,
          filePath,
          isLoading: true
        }));

        // Determine if we should use a regex pattern based on file extension
        const defaultPattern = filePath.endsWith('.log')
          ? '(\\d{1,3}(?:\\.\\d{1,3}){3}) - - \\[(.*?)\\] "(.*?)" (\\d{3}) (\\d+|-)'
          : undefined;

        const nbrColumns = defaultPattern ? 5 : undefined;

        setState(prev => ({
          ...prev,
          pattern: defaultPattern,
          nbrColumns
        }));

        console.log('Sending OpenFile command:', { path: filePath, pattern: defaultPattern, nbr_columns: nbrColumns });
        vscode.postMessage({
          type: 'openFile',
          path: filePath,
          pattern: defaultPattern,
          nbr_columns: nbrColumns
        });
      } else if (message.type === 'response') {
        console.log('Received response:', message.data);
        handleResponse(message.data);
      } else if (message.type === 'error') {
        setState(prev => ({
          ...prev,
          error: message.message,
          isLoading: false,
          isSearching: false
        }));
      }
    };

    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
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

  return (
    <div className="flex flex-col w-full h-full">
      <SearchBar
        onSearch={handleSearch}
        isSearching={state.isSearching}
        searchProgress={state.searchProgress}
        totalResults={state.searchResults.length}
        searchComplete={state.searchComplete}
      />

      <LogViewer
        lineCount={state.lineCount}
        chunks={state.chunks}
        searchResults={state.searchResults}
        onGetChunk={handleGetChunk}
        nbrColumns={state.nbrColumns}
      />

      <StatusBar
        fileName={state.filePath.split('/').pop() || ''}
        lineCount={state.lineCount}
        searchResultCount={state.searchResults.length}
      />
    </div>
  );
};
