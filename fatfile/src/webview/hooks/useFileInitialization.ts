import { useEffect } from "react";
import type { AppState } from "../types/appState";
import type { ExtensionMessage } from "../../types";
import { ChunkManager } from "../services/chunkManager";

interface VsCodeApi {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
}

interface UseFileInitializationProps {
  vscode: VsCodeApi;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  chunkManager: ChunkManager;
  handleResponse: (response: any) => void;
}

/**
 * Hook to manage file initialization flow:
 * GetFileEncoding -> OpenFile -> GetChunk (preview) -> GetParsingInformation
 */
export const useFileInitialization = ({
  vscode,
  state,
  setState,
  chunkManager,
  handleResponse,
}: UseFileInitializationProps) => {
  // Listen to messages from extension
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data as ExtensionMessage;
      console.log("[WEBVIEW] <<<< Received message from extension:", message);

      if (message.type === "init") {
        const filePath = message.filePath;
        console.log("[WEBVIEW] Initializing with file:", filePath);

        // Clear chunk manager when opening a new file
        const clearedChunks = chunkManager.clearAll();

        setState((prev) => ({
          ...prev,
          filePath,
          isLoading: true,
          chunks: clearedChunks,
        }));

        // Start the initialization flow: GetFileEncoding -> OpenFile -> GetChunk -> GetParsingInformation
        console.log("[WEBVIEW] >>>> Sending GetFileEncoding command:", {
          path: filePath,
        });
        vscode.postMessage({
          type: "getFileEncoding",
          path: filePath,
        });
      } else if (message.type === "response") {
        console.log(
          "[WEBVIEW] Got response message, calling handleResponse with:",
          message.data
        );
        handleResponse(message.data);
      } else if (message.type === "error") {
        console.log("[WEBVIEW] Got error message:", message.message);
        setState((prev) => ({
          ...prev,
          error: message.message,
          isLoading: false,
          isSearching: false,
        }));
      }
    };

    console.log("[WEBVIEW] Setting up message listener");
    window.addEventListener("message", messageHandler);
    return () => {
      console.log("[WEBVIEW] Removing message listener");
      window.removeEventListener("message", messageHandler);
    };
  }, [handleResponse, chunkManager, setState, vscode]);

  // After receiving encoding, open the file
  useEffect(() => {
    console.log(
      "[WEBVIEW] useEffect[encoding]: encoding=",
      state.encoding,
      "filePath=",
      state.filePath
    );
    if (state.encoding && state.filePath) {
      console.log(
        "[WEBVIEW] >>>> Encoding received, opening file:",
        state.filePath
      );
      vscode.postMessage({
        type: "openFile",
        path: state.filePath,
      });
    }
  }, [state.encoding, state.filePath, vscode]);

  // After file is opened, get first lines for preview
  useEffect(() => {
    console.log(
      "[WEBVIEW] useEffect[lineCount]: lineCount=",
      state.lineCount,
      "previewLines.length=",
      state.previewLines.length,
      "parsingColumns=",
      state.parsingColumns
    );
    // Only request preview if we haven't started parsing yet
    if (
      state.lineCount > 0 &&
      state.previewLines.length === 0 &&
      state.parsingColumns === null
    ) {
      console.log("[WEBVIEW] >>>> File opened, getting preview chunk");
      vscode.postMessage({
        type: "getChunk",
        start_line: 0,
        end_line: 10,
      });
    }
  }, [state.lineCount, state.previewLines.length, state.parsingColumns, vscode]);

  // After preview lines are received, get parsing information
  useEffect(() => {
    console.log(
      "[WEBVIEW] useEffect[previewLines]: previewLines.length=",
      state.previewLines.length,
      "logFormat=",
      state.logFormat,
      "showParsingConfig=",
      state.showParsingConfig
    );
    if (
      state.previewLines.length > 0 &&
      !state.logFormat &&
      !state.showParsingConfig
    ) {
      console.log(
        "[WEBVIEW] >>>> Preview lines received, getting parsing information"
      );
      vscode.postMessage({
        type: "getParsingInformation",
      });
    }
  }, [state.previewLines.length, state.logFormat, state.showParsingConfig, vscode]);

  // Show encoding warning when encoding is not supported
  useEffect(() => {
    if (state.encoding && !state.encodingSupported) {
      // Send a message to the extension to show a VSCode warning
      vscode.postMessage({
        type: "showEncodingWarning",
        encoding: state.encoding,
      });
    }
  }, [state.encoding, state.encodingSupported, vscode]);
};
