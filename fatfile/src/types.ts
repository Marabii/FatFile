// Backend Protocol Types
export interface OpenFileCommand {
  OpenFile: {
    path: string;
    pattern?: string;
    nbr_columns?: number;
  };
}

export interface GetChunkCommand {
  GetChunk: {
    start_line: number;
    end_line: number;
  };
}

export interface SearchCommand {
  Search: {
    pattern: string;
  };
}

export type Command = OpenFileCommand | GetChunkCommand | SearchCommand;

export interface FileOpenedResponse {
  FileOpened: {
    line_count: number;
  };
}

export interface ChunkResponse {
  Chunk: {
    data: string[][];
    start_line: number;
    end_line: number;
  };
}

export interface SearchMatch {
  line_number: number;
  column: number;
  start_index: number;
  end_index: number;
}

export interface SearchResultsResponse {
  SearchResults: {
    matches: SearchMatch[];
    total_matches: number;
    search_complete: boolean;
  };
}

export interface SearchProgressResponse {
  SearchProgress: {
    percent: number;
  };
}

export interface ProgressResponse {
  Progress: {
    percent: number;
    message: string;
  };
}

export interface ErrorResponse {
  Error: {
    message: string;
  };
}

export interface InfoResponse {
  Info: {
    message: string;
  };
}

export type Response =
  | FileOpenedResponse
  | ChunkResponse
  | SearchResultsResponse
  | SearchProgressResponse
  | ProgressResponse
  | ErrorResponse
  | InfoResponse;

// Webview Message Types
export interface WebviewOpenFileMessage {
  type: 'openFile';
  path: string;
  pattern?: string;
  nbr_columns?: number;
}

export interface WebviewGetChunkMessage {
  type: 'getChunk';
  start_line: number;
  end_line: number;
}

export interface WebviewSearchMessage {
  type: 'search';
  pattern: string;
}

export type WebviewMessage =
  | WebviewOpenFileMessage
  | WebviewGetChunkMessage
  | WebviewSearchMessage;

export interface ExtensionResponseMessage {
  type: 'response';
  data: Response;
}

export interface ExtensionErrorMessage {
  type: 'error';
  message: string;
}

export interface ExtensionInitMessage {
  type: 'init';
  filePath: string;
}

export type ExtensionMessage = ExtensionResponseMessage | ExtensionErrorMessage | ExtensionInitMessage;
