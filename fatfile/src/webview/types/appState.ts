import type { SearchMatch, LogFormat } from "../../types";

export interface AppState {
  filePath: string | null;
  lineCount: number;
  chunks: Map<number, string[][]>; // For main viewer (100-line chunks)
  searchLines: Map<number, string[][]>; // For search results (individual lines)
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

export const initialAppState: AppState = {
  filePath: null,
  lineCount: 0,
  chunks: new Map(),
  searchLines: new Map(),
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
};
