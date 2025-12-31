// Backend Protocol Types
export type LogFormat =
  | 'CommonLogFormat'
  | 'SyslogRFC3164'
  | 'SyslogRFC5424'
  | 'W3CExtended'
  | 'CommonEventFormat'
  | 'NCSACombined'
  | 'Other';

export interface GetFileEncodingCommand {
  GetFileEncoding: {
    path: string;
  };
}

export interface OpenFileCommand {
  OpenFile: {
    path: string;
  };
}

export interface GetParsingInformationCommand {
  GetParsingInformation: null;
}

export interface ParseFileCommand {
  ParseFile: {
    log_format: LogFormat;
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

export type Command =
  | GetFileEncodingCommand
  | OpenFileCommand
  | GetParsingInformationCommand
  | ParseFileCommand
  | GetChunkCommand
  | SearchCommand;

export interface EncodingResponse {
  Encoding: {
    encoding: string;
    is_supported: boolean;
  };
}

export interface FileOpenedResponse {
  FileOpened: {
    line_count: number;
  };
}

export interface ParsingInformationResponse {
  ParsingInformation: {
    log_format: LogFormat;
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

export interface FileTruncatedResponse {
  FileTruncated: {
    line_count: number;
  };
}

export interface LinesAddedResponse {
  LinesAdded: {
    old_line_count: number;
    new_line_count: number;
  };
}

export type Response =
  | EncodingResponse
  | FileOpenedResponse
  | ParsingInformationResponse
  | ChunkResponse
  | SearchResultsResponse
  | SearchProgressResponse
  | ProgressResponse
  | ErrorResponse
  | InfoResponse
  | FileTruncatedResponse
  | LinesAddedResponse;

// Webview Message Types
export interface WebviewGetFileEncodingMessage {
  type: 'getFileEncoding';
  path: string;
}

export interface WebviewOpenFileMessage {
  type: 'openFile';
  path: string;
}

export interface WebviewGetParsingInformationMessage {
  type: 'getParsingInformation';
}

export interface WebviewParseFileMessage {
  type: 'parseFile';
  log_format: LogFormat;
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

export interface WebviewShowEncodingWarningMessage {
  type: 'showEncodingWarning';
  encoding: string;
}

export type WebviewMessage =
  | WebviewGetFileEncodingMessage
  | WebviewOpenFileMessage
  | WebviewGetParsingInformationMessage
  | WebviewParseFileMessage
  | WebviewGetChunkMessage
  | WebviewSearchMessage
  | WebviewShowEncodingWarningMessage;

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

export interface ExtensionShowParsingConfigMessage {
  type: 'showParsingConfig';
  logFormat: LogFormat;
  previewLines: string[][];
}

export type ExtensionMessage =
  | ExtensionResponseMessage
  | ExtensionErrorMessage
  | ExtensionInitMessage
  | ExtensionShowParsingConfigMessage;
