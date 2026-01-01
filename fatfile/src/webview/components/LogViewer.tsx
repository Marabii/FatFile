import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { FixedSizeList as List } from "react-window";
import Draggable from "react-draggable";
import type { SearchMatch } from "../../types";

interface LogViewerProps {
  lineCount: number;
  chunks: Map<number, string[][]>;
  searchResults: SearchMatch[];
  onGetChunk: (startLine: number, endLine: number) => void;
  nbrColumns?: number;
  onLineClick?: (lineNumber: number) => void;
  highlightedLine?: number;
  showHeader?: boolean;
  onClose?: () => void;
  title?: string;
  onChunkAccessed?: (chunkStart: number) => void;
  isLiveTailActive?: boolean;
}

const CHUNK_SIZE = 100;
const LINE_HEIGHT = 20;
const MAX_VIRTUAL_ITEMS = 1000000; // Max items in virtual list to avoid browser scroll limits

const COLUMN_COLORS = [
  "#4EC9B0", // Cyan
  "#CE9178", // Orange
  "#DCDCAA", // Yellow
  "#569CD6", // Blue
  "#C586C0", // Purple
  "#9CDCFE", // Light Blue
  "#B5CEA8", // Green
];

export interface LogViewerRef {
  goToLine: (lineNum: number) => void;
}

export const LogViewer = forwardRef<LogViewerRef, LogViewerProps>(
  (
    {
      lineCount,
      chunks,
      searchResults,
      onGetChunk,
      nbrColumns,
      onLineClick,
      highlightedLine,
      showHeader = false,
      onClose,
      title,
      onChunkAccessed,
      isLiveTailActive = false,
    },
    ref
  ) => {
    const listRef = useRef<List>(null);
    const [containerHeight, setContainerHeight] = useState(600);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(800);
    const [columnWidths, setColumnWidths] = useState<number[]>([]);

    // For very large files, use windowing with offset
    const [lineOffset, setLineOffset] = useState(0);
    const [goToLineInput, setGoToLineInput] = useState("");

    // Live Tail tracking
    const previousLineCount = useRef(lineCount);

    // Determine if we need windowing
    const needsWindowing = lineCount > MAX_VIRTUAL_ITEMS;
    const virtualItemCount = needsWindowing ? MAX_VIRTUAL_ITEMS : lineCount;

    // Track which chunks are loaded
    const loadedChunks = useRef<Set<number>>(new Set());

    // Build search result index for quick lookup
    const searchIndex = useRef<Map<number, SearchMatch[]>>(new Map());

    // Clear loadedChunks when chunks are removed
    useEffect(() => {
      if (chunks.size === 0) {
        console.log(
          "[LogViewer] All chunks cleared, resetting loadedChunks ref"
        );
        loadedChunks.current.clear();
      } else {
        // Remove from loadedChunks any chunks that are no longer in the chunks Map
        const chunksToRemove: number[] = [];
        loadedChunks.current.forEach((chunkStart) => {
          if (!chunks.has(chunkStart)) {
            chunksToRemove.push(chunkStart);
          }
        });
        chunksToRemove.forEach((chunk) => {
          loadedChunks.current.delete(chunk);
          console.log("[LogViewer] Removed chunk from loadedChunks:", chunk);
        });
      }
    }, [chunks]);

    useEffect(() => {
      searchIndex.current = new Map();
      for (const match of searchResults) {
        const lineMatches = searchIndex.current.get(match.line_number) || [];
        lineMatches.push(match);
        searchIndex.current.set(match.line_number, lineMatches);
      }
    }, [searchResults]);

    // Update container height and width on resize
    useEffect(() => {
      const updateDimensions = () => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setContainerHeight(rect.height);
          setContainerWidth(rect.width);
        }
      };

      updateDimensions();
      window.addEventListener("resize", updateDimensions);
      return () => window.removeEventListener("resize", updateDimensions);
    }, []);

    // Initialize column widths when number of columns changes
    useEffect(() => {
      if (nbrColumns && nbrColumns > 0) {
        const LINE_NUMBER_WIDTH = 80;
        const PADDING = 16; // 8px on each side
        const availableWidth = containerWidth - LINE_NUMBER_WIDTH - PADDING;
        const columnWidth = Math.max(150, availableWidth / nbrColumns);
        setColumnWidths(Array(nbrColumns).fill(columnWidth));
      }
    }, [nbrColumns, containerWidth]);

    // Handle column resize
    const handleColumnResize = useCallback(
      (columnIndex: number, deltaX: number) => {
        setColumnWidths((prev) => {
          const newWidths = [...prev];
          newWidths[columnIndex] = Math.max(
            50,
            newWidths[columnIndex] + deltaX
          );
          return newWidths;
        });
      },
      []
    );

    // Request chunks as needed (accounting for offset)
    const ensureChunkLoaded = useCallback(
      (virtualIndex: number) => {
        const actualLineIndex = needsWindowing
          ? lineOffset + virtualIndex
          : virtualIndex;
        const chunkStart =
          Math.floor(actualLineIndex / CHUNK_SIZE) * CHUNK_SIZE;

        if (!loadedChunks.current.has(chunkStart) && !chunks.has(chunkStart)) {
          loadedChunks.current.add(chunkStart);
          const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, lineCount);
          onGetChunk(chunkStart, chunkEnd);
        }
      },
      [chunks, lineCount, onGetChunk, needsWindowing, lineOffset]
    );

    // Get line data from chunks (accounting for offset)
    const getLineData = useCallback(
      (virtualIndex: number): string[] | null => {
        const actualLineIndex = needsWindowing
          ? lineOffset + virtualIndex
          : virtualIndex;
        const chunkStart =
          Math.floor(actualLineIndex / CHUNK_SIZE) * CHUNK_SIZE;
        const chunk = chunks.get(chunkStart);

        if (!chunk) {
          ensureChunkLoaded(virtualIndex);
          return null;
        }

        // Mark chunk as accessed for LRU tracking
        onChunkAccessed?.(chunkStart);

        const offsetInChunk = actualLineIndex - chunkStart;
        return chunk[offsetInChunk] || null;
      },
      [chunks, ensureChunkLoaded, needsWindowing, lineOffset, onChunkAccessed]
    );

    // Highlight matches in text
    const highlightMatches = useCallback(
      (text: string, lineNumber: number, columnIndex: number) => {
        const matches = searchIndex.current
          .get(lineNumber)
          ?.filter((m) => m.column === columnIndex);

        if (!matches || matches.length === 0) {
          return <span>{text}</span>;
        }

        const parts: JSX.Element[] = [];
        let lastIndex = 0;

        matches.sort((a, b) => a.start_index - b.start_index);

        for (const match of matches) {
          if (match.start_index > lastIndex) {
            parts.push(
              <span key={`text-${lastIndex}`}>
                {text.substring(lastIndex, match.start_index)}
              </span>
            );
          }

          parts.push(
            <span
              key={`match-${match.start_index}`}
              className="px-1 rounded"
              style={{
                backgroundColor:
                  "var(--vscode-editor-findMatchHighlightBackground)",
                border: "1px solid var(--vscode-editor-findMatchBorder)",
              }}
            >
              {text.substring(match.start_index, match.end_index)}
            </span>
          );

          lastIndex = match.end_index;
        }

        if (lastIndex < text.length) {
          parts.push(
            <span key={`text-${lastIndex}`}>{text.substring(lastIndex)}</span>
          );
        }

        return <>{parts}</>;
      },
      []
    );

    // Handle go to line
    const handleGoToLine = useCallback(
      (lineNum: number) => {
        const targetLine = Math.max(0, Math.min(lineNum - 1, lineCount - 1));

        if (needsWindowing) {
          // Set offset to center the target line in the window
          const newOffset = Math.max(
            0,
            Math.min(
              targetLine - Math.floor(MAX_VIRTUAL_ITEMS / 2),
              lineCount - MAX_VIRTUAL_ITEMS
            )
          );
          setLineOffset(newOffset);

          // Scroll to the relative position in the virtual list
          setTimeout(() => {
            if (listRef.current) {
              const virtualIndex = targetLine - newOffset;
              listRef.current.scrollToItem(virtualIndex, "center");
            }
          }, 100);
        } else {
          if (listRef.current) {
            listRef.current.scrollToItem(targetLine, "center");
          }
        }
      },
      [lineCount, needsWindowing]
    );

    // Expose goToLine method to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        goToLine: handleGoToLine,
      }),
      [handleGoToLine]
    );

    const handleGoToLineSubmit = useCallback(
      (e: React.FormEvent) => {
        e.preventDefault();
        const lineNum = parseInt(goToLineInput, 10);
        if (!isNaN(lineNum) && lineNum > 0) {
          handleGoToLine(lineNum);
          setGoToLineInput("");
        }
      },
      [goToLineInput, handleGoToLine]
    );

    const handlePreviousWindow = useCallback(() => {
      const newOffset = Math.max(0, lineOffset - MAX_VIRTUAL_ITEMS);
      setLineOffset(newOffset);
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollToItem(0, "start");
        }
      }, 50);
    }, [lineOffset]);

    const handleNextWindow = useCallback(() => {
      const newOffset = Math.min(
        lineCount - MAX_VIRTUAL_ITEMS,
        lineOffset + MAX_VIRTUAL_ITEMS
      );
      setLineOffset(newOffset);
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollToItem(0, "start");
        }
      }, 50);
    }, [lineOffset, lineCount]);

    const canGoPrevious = lineOffset > 0;
    const canGoNext = lineOffset + MAX_VIRTUAL_ITEMS < lineCount;

    // Render a single row
    const Row = useCallback(
      ({ index, style }: { index: number; style: React.CSSProperties }) => {
        const lineData = getLineData(index);
        const actualLineIndex = needsWindowing ? lineOffset + index : index;
        const hasMatch = searchIndex.current.has(actualLineIndex);
        const isHighlighted =
          highlightedLine !== undefined && highlightedLine === actualLineIndex;

        if (!lineData) {
          return (
            <div
              style={{
                ...style,
                paddingLeft: "8px",
                paddingRight: "8px",
                display: "flex",
                alignItems: "center",
                opacity: 0.5,
              }}
            >
              <span className="text-xs animate-pulse">Loading...</span>
            </div>
          );
        }

        return (
          <div
            onClick={() => onLineClick?.(actualLineIndex)}
            style={{
              ...style,
              paddingLeft: "8px",
              paddingRight: "8px",
              display: "flex",
              alignItems: "center",
              backgroundColor: isHighlighted
                ? "var(--vscode-list-activeSelectionBackground)"
                : hasMatch && !showHeader
                ? "var(--vscode-editor-findMatchHighlightBackground)"
                : "transparent",
              fontFamily: "var(--vscode-editor-font-family)",
              fontSize: "var(--vscode-editor-font-size)",
              minWidth: "100%",
              boxSizing: "border-box",
              cursor: onLineClick ? "pointer" : "default",
            }}
          >
            {/* Line number - fixed width */}
            <div
              className="select-none flex-shrink-0"
              style={{
                opacity: 0.5,
                width: "80px",
                textAlign: "right",
                fontSize: "11px",
                paddingRight: "12px",
              }}
            >
              {(actualLineIndex + 1).toLocaleString()}
            </div>

            {/* Data columns */}
            <div className="flex-1 flex" style={{ overflow: "visible" }}>
              {lineData.length === 1 ? (
                // Unparsed line - render full width
                <div
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    paddingRight: "8px",
                    cursor: "text",
                  }}
                  onDoubleClick={(e) => {
                    const selection = window.getSelection();
                    if (selection) {
                      const range = document.createRange();
                      range.selectNodeContents(e.currentTarget);
                      selection.removeAllRanges();
                      selection.addRange(range);
                    }
                  }}
                >
                  {lineData[0] || ""}
                </div>
              ) : (
                // Parsed line - render columns
                lineData.map((column, colIndex) => (
                  <div
                    key={colIndex}
                    style={{
                      width: columnWidths[colIndex] || 150,
                      flexShrink: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: "8px",
                      color:
                        nbrColumns && nbrColumns > 1
                          ? COLUMN_COLORS[colIndex % COLUMN_COLORS.length]
                          : "inherit",
                      cursor: "text",
                    }}
                    onDoubleClick={(e) => {
                      const selection = window.getSelection();
                      const range = document.createRange();
                      range.selectNodeContents(e.currentTarget);
                      selection?.removeAllRanges();
                      selection?.addRange(range);
                    }}
                    title={column}
                  >
                    {showHeader ? column : highlightMatches(column, actualLineIndex, colIndex)}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      },
      [
        getLineData,
        highlightMatches,
        nbrColumns,
        needsWindowing,
        lineOffset,
        columnWidths,
        onLineClick,
        highlightedLine,
      ]
    );

    // Scroll to first search result
    useEffect(() => {
      if (searchResults.length > 0 && !isLiveTailActive) {
        const firstMatch = searchResults[0];
        handleGoToLine(firstMatch.line_number + 1);
      }
    }, [searchResults, handleGoToLine, isLiveTailActive]);

    // Handle Live Tail mode
    const scrollToEnd = useCallback(() => {
      if (lineCount > 0) {
        if (needsWindowing) {
          // Set offset to show the last window
          const newOffset = Math.max(0, lineCount - MAX_VIRTUAL_ITEMS);
          setLineOffset(newOffset);

          // Scroll to the bottom of the virtual list
          setTimeout(() => {
            if (listRef.current) {
              const virtualIndex = lineCount - newOffset - 1;
              listRef.current.scrollToItem(virtualIndex, "end");
            }
          }, 100);
        } else {
          if (listRef.current) {
            listRef.current.scrollToItem(lineCount - 1, "end");
          }
        }
      }
    }, [lineCount, needsWindowing]);

    // When lineCount increases and live tail is active, scroll to end
    useEffect(() => {
      if (isLiveTailActive && lineCount > previousLineCount.current) {
        console.log(
          "[LiveTail] New lines detected:",
          previousLineCount.current,
          "->",
          lineCount
        );

        // Scroll to end (new lines are already in chunks from LinesAdded event)
        setTimeout(() => {
          scrollToEnd();
        }, 100);
      }

      previousLineCount.current = lineCount;
    }, [lineCount, isLiveTailActive, scrollToEnd]);

    // When live tail is activated, scroll to end
    useEffect(() => {
      if (isLiveTailActive) {
        scrollToEnd();
      }
    }, [isLiveTailActive, scrollToEnd]);

    return (
      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
        {showHeader && (
          <div
            className="flex items-center justify-between px-4 py-2 border-b"
            style={{
              borderColor: "var(--vscode-panel-border)",
              backgroundColor: "var(--vscode-sideBar-background)",
            }}
          >
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--vscode-sideBarTitle-foreground)" }}
            >
              {title || "Search Results"}
            </span>
            {onClose && (
              <button
                onClick={onClose}
                className="px-2 py-1 text-xs rounded transition-colors hover:bg-opacity-20"
                style={{
                  color: "var(--vscode-icon-foreground)",
                }}
                title="Close panel"
              >
                ✕
              </button>
            )}
          </div>
        )}
        <div
          className="flex items-center gap-3 px-4 py-2 border-b"
          style={{ borderColor: "var(--vscode-panel-border)" }}
        >
          {needsWindowing && (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousWindow}
                disabled={!canGoPrevious}
                className="px-2 py-1 text-xs rounded transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: "var(--vscode-button-background)",
                  color: "var(--vscode-button-foreground)",
                }}
                title="Previous 1M lines"
              >
                ‹
              </button>
              <span className="text-xs opacity-70">
                {(lineOffset + 1).toLocaleString()} -{" "}
                {Math.min(
                  lineOffset + virtualItemCount,
                  lineCount
                ).toLocaleString()}{" "}
                / {lineCount.toLocaleString()}
              </span>
              <button
                onClick={handleNextWindow}
                disabled={!canGoNext}
                className="px-2 py-1 text-xs rounded transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: "var(--vscode-button-background)",
                  color: "var(--vscode-button-foreground)",
                }}
                title="Next 1M lines"
              >
                ›
              </button>
            </div>
          )}
          <div className="flex-1" />
          <form
            onSubmit={handleGoToLineSubmit}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={goToLineInput}
              onChange={(e) => setGoToLineInput(e.target.value)}
              placeholder="Go to line..."
              className="px-2 py-1 text-xs rounded outline-none"
              style={{
                backgroundColor: "var(--vscode-input-background)",
                color: "var(--vscode-input-foreground)",
                border: "1px solid var(--vscode-input-border)",
                width: "120px",
              }}
            />
            <button
              type="submit"
              className="px-2 py-1 text-xs rounded"
              style={{
                backgroundColor: "var(--vscode-button-background)",
                color: "var(--vscode-button-foreground)",
              }}
            >
              Go
            </button>
          </form>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Column Headers */}
          {nbrColumns && nbrColumns > 0 && columnWidths.length > 0 && (
            <div
              style={{
                height: "28px",
                display: "flex",
                alignItems: "center",
                paddingLeft: "8px",
                paddingRight: "8px",
                borderBottom: "1px solid var(--vscode-panel-border)",
                backgroundColor: "var(--vscode-editor-background)",
                fontFamily: "var(--vscode-editor-font-family)",
                fontSize: "11px",
                fontWeight: 600,
                position: "sticky",
                top: 0,
                zIndex: 10,
              }}
            >
              {/* Line number header */}
              <div
                className="select-none flex-shrink-0"
                style={{
                  width: "80px",
                  textAlign: "right",
                  paddingRight: "12px",
                  opacity: 0.7,
                }}
              >
                Line
              </div>

              {/* Column headers with resize handles */}
              <div className="flex-1 flex" style={{ position: "relative" }}>
                {Array.from({ length: nbrColumns }).map((_, colIndex) => (
                  <div
                    key={colIndex}
                    style={{
                      width: columnWidths[colIndex] || 150,
                      flexShrink: 0,
                      paddingRight: "8px",
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      color: COLUMN_COLORS[colIndex % COLUMN_COLORS.length],
                    }}
                  >
                    <span>Column {colIndex + 1}</span>

                    {/* Resize handle */}
                    {colIndex < nbrColumns - 1 && (
                      <Draggable
                        axis="x"
                        position={{ x: 0, y: 0 }}
                        onDrag={(_e, data) => {
                          handleColumnResize(colIndex, data.deltaX);
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: "8px",
                            cursor: "col-resize",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 20,
                          }}
                        >
                          <div
                            style={{
                              width: "2px",
                              height: "100%",
                              backgroundColor: "var(--vscode-panel-border)",
                              transition: "background-color 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "var(--vscode-focusBorder)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "var(--vscode-panel-border)";
                            }}
                          />
                        </div>
                      </Draggable>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data rows */}
          <List
            ref={listRef}
            height={
              (needsWindowing ? containerHeight - 40 : containerHeight) -
              (nbrColumns && nbrColumns > 0 ? 28 : 0)
            }
            itemCount={virtualItemCount}
            itemSize={LINE_HEIGHT}
            width="100%"
            overscanCount={10}
            className="overflow-x-auto"
            style={{ overflowX: "auto" }}
          >
            {Row}
          </List>
        </div>
      </div>
    );
  }
);
