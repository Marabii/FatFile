import { useCallback } from "react";
import type { Response } from "../../types";
import type { AppState } from "../types/appState";
import { ChunkManager } from "../services/chunkManager";
import { CHUNK_SIZE, PREVIEW_LINE_COUNT } from "../config/constants";

interface UseMessageHandlerProps {
  chunkManager: ChunkManager;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

/**
 * Hook to handle responses from the backend
 */
export const useMessageHandler = ({
  chunkManager,
  setState,
}: UseMessageHandlerProps) => {
  const handleResponse = useCallback(
    (response: Response) => {
      console.log("[WEBVIEW] Handling response:", response);

      if ("Encoding" in response) {
        console.log("[WEBVIEW] Received encoding response:", response.Encoding);
        setState((prev) => ({
          ...prev,
          encoding: response.Encoding.encoding,
          encodingSupported: response.Encoding.is_supported,
        }));
      } else if ("FileOpened" in response) {
        console.log(
          "[WEBVIEW] Received FileOpened response:",
          response.FileOpened
        );
        setState((prev) => ({
          ...prev,
          lineCount: response.FileOpened.line_count,
          error: null,
        }));
      } else if ("Chunk" in response) {
        console.log(
          "[WEBVIEW] Received Chunk response:",
          `lines ${response.Chunk.start_line}-${response.Chunk.end_line}`,
          `(${response.Chunk.data.length} lines)`
        );
        setState((prev) => {
          // If we don't have preview lines yet and haven't configured parsing,
          // use this chunk as the preview (taking only first 10 lines)
          const needsPreview =
            prev.previewLines.length === 0 &&
            !prev.showParsingConfig &&
            !prev.isParsed;
          console.log("[WEBVIEW] Needs preview?", needsPreview, {
            previewLinesLength: prev.previewLines.length,
            showParsingConfig: prev.showParsingConfig,
            isParsed: prev.isParsed,
          });

          if (needsPreview) {
            console.log(
              "[WEBVIEW] Storing as preview chunk, taking first 10 lines from",
              response.Chunk.data.length,
              "lines"
            );
            return {
              ...prev,
              previewLines: response.Chunk.data.slice(0, PREVIEW_LINE_COUNT),
            };
          } else {
            // Regular chunk for viewing
            // Backend uses exclusive end, so check data length instead
            const isSingleLine = response.Chunk.data.length === 1;

            console.log(
              "[WEBVIEW] Storing",
              isSingleLine ? "single line" : "regular chunk",
              "at line",
              response.Chunk.start_line,
              "with",
              response.Chunk.data.length,
              "lines"
            );
            console.log("[WEBVIEW] First line of chunk:", response.Chunk.data[0]);
            console.log(
              "[WEBVIEW] isParsed=",
              prev.isParsed,
              "parsingColumns=",
              prev.parsingColumns
            );

            // Route to appropriate storage based on chunk type
            if (isSingleLine) {
              // Single-line chunk for search results
              const updatedSearchLines = new Map(prev.searchLines);
              updatedSearchLines.set(response.Chunk.start_line, response.Chunk.data);

              console.log(
                "[WEBVIEW] Added to searchLines - Total search lines:",
                updatedSearchLines.size
              );

              return {
                ...prev,
                searchLines: updatedSearchLines,
                isLoading: false,
              };
            } else {
              // Multi-line chunk for main viewer - ChunkManager handles LRU eviction
              const updatedChunks = chunkManager.addChunk(
                prev.chunks,
                response.Chunk.start_line,
                response.Chunk.data
              );

              return {
                ...prev,
                chunks: updatedChunks,
                isLoading: false,
              };
            }
          }
        });
      } else if ("ParsingInformation" in response) {
        console.log(
          "[WEBVIEW] Received ParsingInformation response:",
          response.ParsingInformation
        );
        setState((prev) => {
          // If we have parsingColumns set, this is a confirmation after applying parsing
          if (prev.parsingColumns !== null) {
            console.log(
              "[WEBVIEW] Parsing confirmed, clearing chunks and setting isParsed=true"
            );

            // Clear chunk manager when reloading for parsing
            const clearedChunks = chunkManager.clearAll();

            return {
              ...prev,
              logFormat: response.ParsingInformation.log_format,
              isParsed: true,
              showParsingConfig: false,
              isLoading: false,
              chunks: clearedChunks,
              // Keep previewLines - no longer needed but clearing it triggers unwanted requests
            };
          }
          // If we haven't shown the config yet, show it now (initial detection)
          else if (!prev.showParsingConfig && !prev.isParsed) {
            console.log("[WEBVIEW] Showing parsing config panel!");
            return {
              ...prev,
              logFormat: response.ParsingInformation.log_format,
              showParsingConfig: true,
              isLoading: false,
            };
          }
          // Otherwise just update the format
          else {
            console.log("[WEBVIEW] Updating log format");
            return {
              ...prev,
              logFormat: response.ParsingInformation.log_format,
              isLoading: false,
            };
          }
        });
      } else if ("SearchResults" in response) {
        setState((prev) => ({
          ...prev,
          searchResults: response.SearchResults.matches,
          searchComplete: response.SearchResults.search_complete,
          isSearching: false,
          searchProgress: 100,
        }));
      } else if ("Progress" in response) {
        setState((prev) => ({
          ...prev,
          searchProgress: response.Progress.percent,
        }));
      } else if ("Error" in response) {
        setState((prev) => ({
          ...prev,
          error: response.Error.message,
          isLoading: false,
          isSearching: false,
        }));
      } else if ("Info" in response) {
        console.log("[WEBVIEW] Backend info:", response.Info.message);
      } else if ("FileTruncated" in response) {
        console.log(
          "[WEBVIEW] File was truncated, new line count:",
          response.FileTruncated.line_count
        );
        const clearedChunks = chunkManager.clearAll();
        setState((prev) => ({
          ...prev,
          lineCount: response.FileTruncated.line_count,
          chunks: clearedChunks,
        }));
      } else if ("LinesAdded" in response) {
        console.log(
          "[WEBVIEW] New lines added:",
          response.LinesAdded.old_line_count,
          "->",
          response.LinesAdded.new_line_count,
          `(${response.LinesAdded.new_lines.length} lines)`
        );
        setState((prev) => {
          const oldCount = response.LinesAdded.old_line_count;
          const newLines = response.LinesAdded.new_lines;
          let updatedChunks = prev.chunks;

          // Add new lines to appropriate chunks
          if (newLines.length > 0) {
            let lineIndex = oldCount;
            for (const line of newLines) {
              const chunkStart = Math.floor(lineIndex / CHUNK_SIZE) * CHUNK_SIZE;

              // Get or create chunk
              let chunk = updatedChunks.get(chunkStart);
              if (!chunk) {
                chunk = [];
              }

              const newChunk = [...chunk, line];
              updatedChunks = chunkManager.addChunk(updatedChunks, chunkStart, newChunk);
              lineIndex++;
            }

            console.log(
              "[WEBVIEW] Added new lines to chunks:",
              Array.from(
                new Set(
                  newLines.map((_, i) =>
                    Math.floor((oldCount + i) / CHUNK_SIZE) * CHUNK_SIZE
                  )
                )
              )
            );
          }

          return {
            ...prev,
            lineCount: response.LinesAdded.new_line_count,
            chunks: updatedChunks,
          };
        });
      }
    },
    [chunkManager, setState]
  );

  return handleResponse;
};
