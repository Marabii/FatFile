import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import type { SearchMatch } from '../../types';

interface LogViewerProps {
  lineCount: number;
  chunks: Map<number, string[][]>;
  searchResults: SearchMatch[];
  onGetChunk: (startLine: number, endLine: number) => void;
  nbrColumns?: number;
}

const CHUNK_SIZE = 100;
const LINE_HEIGHT = 20;
const MAX_VIRTUAL_ITEMS = 1000000; // Max items in virtual list to avoid browser scroll limits

const COLUMN_COLORS = [
  '#4EC9B0', // Cyan
  '#CE9178', // Orange
  '#DCDCAA', // Yellow
  '#569CD6', // Blue
  '#C586C0', // Purple
  '#9CDCFE', // Light Blue
  '#B5CEA8', // Green
];

export const LogViewer: React.FC<LogViewerProps> = ({
  lineCount,
  chunks,
  searchResults,
  onGetChunk,
  nbrColumns
}) => {
  const listRef = useRef<List>(null);
  const [containerHeight, setContainerHeight] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  // For very large files, use windowing with offset
  const [lineOffset, setLineOffset] = useState(0);
  const [goToLineInput, setGoToLineInput] = useState('');

  // Determine if we need windowing
  const needsWindowing = lineCount > MAX_VIRTUAL_ITEMS;
  const virtualItemCount = needsWindowing ? MAX_VIRTUAL_ITEMS : lineCount;

  // Track which chunks are loaded
  const loadedChunks = useRef<Set<number>>(new Set());

  // Build search result index for quick lookup
  const searchIndex = useRef<Map<number, SearchMatch[]>>(new Map());

  useEffect(() => {
    searchIndex.current = new Map();
    for (const match of searchResults) {
      const lineMatches = searchIndex.current.get(match.line_number) || [];
      lineMatches.push(match);
      searchIndex.current.set(match.line_number, lineMatches);
    }
  }, [searchResults]);

  // Update container height on resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerHeight(rect.height);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Request chunks as needed (accounting for offset)
  const ensureChunkLoaded = useCallback((virtualIndex: number) => {
    const actualLineIndex = needsWindowing ? lineOffset + virtualIndex : virtualIndex;
    const chunkStart = Math.floor(actualLineIndex / CHUNK_SIZE) * CHUNK_SIZE;

    if (!loadedChunks.current.has(chunkStart) && !chunks.has(chunkStart)) {
      loadedChunks.current.add(chunkStart);
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, lineCount);
      onGetChunk(chunkStart, chunkEnd);
    }
  }, [chunks, lineCount, onGetChunk, needsWindowing, lineOffset]);

  // Get line data from chunks (accounting for offset)
  const getLineData = useCallback((virtualIndex: number): string[] | null => {
    const actualLineIndex = needsWindowing ? lineOffset + virtualIndex : virtualIndex;
    const chunkStart = Math.floor(actualLineIndex / CHUNK_SIZE) * CHUNK_SIZE;
    const chunk = chunks.get(chunkStart);

    if (!chunk) {
      ensureChunkLoaded(virtualIndex);
      return null;
    }

    const offsetInChunk = actualLineIndex - chunkStart;
    return chunk[offsetInChunk] || null;
  }, [chunks, ensureChunkLoaded, needsWindowing, lineOffset]);

  // Highlight matches in text
  const highlightMatches = useCallback((text: string, lineNumber: number, columnIndex: number) => {
    const matches = searchIndex.current.get(lineNumber)?.filter(m => m.column === columnIndex);

    if (!matches || matches.length === 0) {
      return <span>{text}</span>;
    }

    const parts: JSX.Element[] = [];
    let lastIndex = 0;

    matches.sort((a, b) => a.start_index - b.start_index);

    for (const match of matches) {
      if (match.start_index > lastIndex) {
        parts.push(<span key={`text-${lastIndex}`}>{text.substring(lastIndex, match.start_index)}</span>);
      }

      parts.push(
        <span
          key={`match-${match.start_index}`}
          className="px-1 rounded"
          style={{
            backgroundColor: 'var(--vscode-editor-findMatchHighlightBackground)',
            border: '1px solid var(--vscode-editor-findMatchBorder)'
          }}
        >
          {text.substring(match.start_index, match.end_index)}
        </span>
      );

      lastIndex = match.end_index;
    }

    if (lastIndex < text.length) {
      parts.push(<span key={`text-${lastIndex}`}>{text.substring(lastIndex)}</span>);
    }

    return <>{parts}</>;
  }, []);

  // Handle go to line
  const handleGoToLine = useCallback((lineNum: number) => {
    const targetLine = Math.max(0, Math.min(lineNum - 1, lineCount - 1));

    if (needsWindowing) {
      // Set offset to center the target line in the window
      const newOffset = Math.max(0, Math.min(
        targetLine - Math.floor(MAX_VIRTUAL_ITEMS / 2),
        lineCount - MAX_VIRTUAL_ITEMS
      ));
      setLineOffset(newOffset);

      // Scroll to the relative position in the virtual list
      setTimeout(() => {
        if (listRef.current) {
          const virtualIndex = targetLine - newOffset;
          listRef.current.scrollToItem(virtualIndex, 'center');
        }
      }, 100);
    } else {
      if (listRef.current) {
        listRef.current.scrollToItem(targetLine, 'center');
      }
    }
  }, [lineCount, needsWindowing]);

  const handleGoToLineSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const lineNum = parseInt(goToLineInput, 10);
    if (!isNaN(lineNum) && lineNum > 0) {
      handleGoToLine(lineNum);
      setGoToLineInput('');
    }
  }, [goToLineInput, handleGoToLine]);

  const handlePreviousWindow = useCallback(() => {
    const newOffset = Math.max(0, lineOffset - MAX_VIRTUAL_ITEMS);
    setLineOffset(newOffset);
    setTimeout(() => {
      if (listRef.current) {
        listRef.current.scrollToItem(0, 'start');
      }
    }, 50);
  }, [lineOffset]);

  const handleNextWindow = useCallback(() => {
    const newOffset = Math.min(lineCount - MAX_VIRTUAL_ITEMS, lineOffset + MAX_VIRTUAL_ITEMS);
    setLineOffset(newOffset);
    setTimeout(() => {
      if (listRef.current) {
        listRef.current.scrollToItem(0, 'start');
      }
    }, 50);
  }, [lineOffset, lineCount]);

  const canGoPrevious = lineOffset > 0;
  const canGoNext = lineOffset + MAX_VIRTUAL_ITEMS < lineCount;

  // Render a single row
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const lineData = getLineData(index);
    const actualLineIndex = needsWindowing ? lineOffset + index : index;
    const hasMatch = searchIndex.current.has(actualLineIndex);

    if (!lineData) {
      return (
        <div
          style={{
            ...style,
            paddingLeft: '8px',
            paddingRight: '8px',
            display: 'flex',
            alignItems: 'center',
            opacity: 0.5
          }}
        >
          <span className="text-xs animate-pulse">Loading...</span>
        </div>
      );
    }

    return (
      <div
        style={{
          ...style,
          paddingLeft: '8px',
          paddingRight: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: hasMatch ? 'var(--vscode-editor-findMatchHighlightBackground)' : 'transparent',
          fontFamily: 'var(--vscode-editor-font-family)',
          fontSize: 'var(--vscode-editor-font-size)',
          minWidth: '100%',
          boxSizing: 'border-box'
        }}
      >
        <span
          className="select-none flex-shrink-0"
          style={{
            opacity: 0.5,
            width: '80px',
            textAlign: 'right',
            fontSize: '11px'
          }}
        >
          {(actualLineIndex + 1).toLocaleString()}
        </span>

        <div className="flex-1 flex gap-3" style={{ whiteSpace: 'nowrap' }}>
          {lineData.map((column, colIndex) => (
            <span
              key={colIndex}
              className="flex-shrink-0"
              style={{
                color: nbrColumns && nbrColumns > 1 ? COLUMN_COLORS[colIndex % COLUMN_COLORS.length] : 'inherit'
              }}
            >
              {highlightMatches(column, actualLineIndex, colIndex)}
            </span>
          ))}
        </div>
      </div>
    );
  }, [getLineData, highlightMatches, nbrColumns, needsWindowing, lineOffset]);

  // Scroll to first search result
  useEffect(() => {
    if (searchResults.length > 0) {
      const firstMatch = searchResults[0];
      handleGoToLine(firstMatch.line_number + 1);
    }
  }, [searchResults, handleGoToLine]);

  return (
    <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
      {needsWindowing && (
        <div className="flex items-center gap-3 px-4 py-2 border-b" style={{ borderColor: 'var(--vscode-panel-border)' }}>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousWindow}
              disabled={!canGoPrevious}
              className="px-2 py-1 text-xs rounded transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--vscode-button-background)',
                color: 'var(--vscode-button-foreground)'
              }}
              title="Previous 1M lines"
            >
              ‹
            </button>
            <span className="text-xs opacity-70">
              {(lineOffset + 1).toLocaleString()} - {Math.min(lineOffset + virtualItemCount, lineCount).toLocaleString()} / {lineCount.toLocaleString()}
            </span>
            <button
              onClick={handleNextWindow}
              disabled={!canGoNext}
              className="px-2 py-1 text-xs rounded transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--vscode-button-background)',
                color: 'var(--vscode-button-foreground)'
              }}
              title="Next 1M lines"
            >
              ›
            </button>
          </div>
          <div className="flex-1" />
          <form onSubmit={handleGoToLineSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={goToLineInput}
              onChange={(e) => setGoToLineInput(e.target.value)}
              placeholder="Go to line..."
              className="px-2 py-1 text-xs rounded outline-none"
              style={{
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                width: '120px'
              }}
            />
            <button
              type="submit"
              className="px-2 py-1 text-xs rounded"
              style={{
                backgroundColor: 'var(--vscode-button-background)',
                color: 'var(--vscode-button-foreground)'
              }}
            >
              Go
            </button>
          </form>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <List
          ref={listRef}
          height={needsWindowing ? containerHeight - 40 : containerHeight}
          itemCount={virtualItemCount}
          itemSize={LINE_HEIGHT}
          width="100%"
          overscanCount={10}
          className="overflow-x-auto"
          style={{ overflowX: 'auto' }}
        >
          {Row}
        </List>
      </div>
    </div>
  );
};
