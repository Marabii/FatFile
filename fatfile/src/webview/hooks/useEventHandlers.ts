import { useCallback } from "react";
import type { LogFormat } from "../../types";
import type { AppState } from "../types/appState";

interface VsCodeApi {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
}

interface UseEventHandlersProps {
  vscode: VsCodeApi;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

/**
 * Hook to manage all event handlers for user interactions
 */
export const useEventHandlers = ({
  vscode,
  setState,
}: UseEventHandlersProps) => {
  const handleGetChunk = useCallback(
    (startLine: number, endLine: number) => {
      console.log("[App] Requesting chunk:", startLine, "->", endLine);
      vscode.postMessage({
        type: "getChunk",
        start_line: startLine,
        end_line: endLine,
      });
    },
    [vscode]
  );

  const handleSearch = useCallback(
    (pattern: string) => {
      setState((prev) => ({
        ...prev,
        isSearching: true,
        searchProgress: 0,
        searchResults: [],
        searchLines: new Map(), // Clear old search lines
      }));

      vscode.postMessage({
        type: "search",
        pattern,
      });
    },
    [vscode, setState]
  );

  const handleApplyParsing = useCallback(
    (logFormat: LogFormat, pattern?: string, nbrColumns?: number) => {
      console.log(
        "[WEBVIEW] Applying parsing with format:",
        logFormat,
        "pattern:",
        pattern,
        "columns:",
        nbrColumns
      );

      // Determine the number of columns for this format
      const columns =
        nbrColumns ||
        (logFormat !== "Other"
          ? logFormat === "CommonEventFormat" ||
            logFormat === "SyslogRFC5424" ||
            logFormat === "CommonLogFormat"
            ? 8
            : 5
          : 0);

      setState((prev) => ({
        ...prev,
        isLoading: true,
        showParsingConfig: false, // Hide modal immediately
        parsingColumns: columns, // Store the number of columns
      }));

      vscode.postMessage({
        type: "parseFile",
        log_format: logFormat,
        pattern,
        nbr_columns: nbrColumns,
      });
    },
    [vscode, setState]
  );

  const handleSkipParsing = useCallback(() => {
    console.log("Skipping parsing");

    setState((prev) => ({
      ...prev,
      showParsingConfig: false,
      isParsed: false,
      isLoading: false,
    }));
  }, [setState]);

  return {
    handleGetChunk,
    handleSearch,
    handleApplyParsing,
    handleSkipParsing,
  };
};
