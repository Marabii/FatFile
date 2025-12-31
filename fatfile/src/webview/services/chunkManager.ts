/**
 * ChunkManager - Manages chunk storage with automatic LRU eviction
 * This service encapsulates all chunk management logic to prevent accidental cache mismanagement
 *
 * Works with React state by returning new Map instances that can be tracked by React
 * Uses LINE-BASED eviction instead of chunk-based for better memory management
 */

const MAX_LINES_IN_MEMORY = 2000;

export class ChunkManager {
  private accessTimes: Map<number, number> = new Map();

  /**
   * Calculate total number of lines across all chunks
   */
  private getTotalLines(chunks: Map<number, string[][]>): number {
    let total = 0;
    for (const chunk of chunks.values()) {
      total += chunk.length;
    }
    return total;
  }

  /**
   * Add or update a chunk and automatically handle LRU eviction
   * Returns a new Map with the updated chunks (for React state)
   */
  addChunk(
    currentChunks: Map<number, string[][]>,
    startLine: number,
    data: string[][]
  ): Map<number, string[][]> {
    // Create new map with existing chunks
    const newChunks = new Map(currentChunks);

    // Add the chunk
    newChunks.set(startLine, data);

    // Mark as accessed
    this.accessTimes.set(startLine, Date.now());

    // Automatically evict if needed
    const evictedChunks = this.evictIfNeeded(newChunks);

    const totalLines = this.getTotalLines(evictedChunks);
    console.log(
      "[ChunkManager] Added chunk",
      startLine,
      `(${data.length} lines)`,
      "- Total lines in memory:",
      totalLines,
      "/",
      MAX_LINES_IN_MEMORY,
      "- Chunks:",
      evictedChunks.size,
      "- Chunk keys:",
      Array.from(evictedChunks.keys())
    );

    return evictedChunks;
  }

  /**
   * Clear all chunks (used when opening new file, parsing, or file truncation)
   * Returns an empty Map (for React state)
   */
  clearAll(): Map<number, string[][]> {
    this.accessTimes.clear();
    console.log("[ChunkManager] Cleared all chunks");
    return new Map();
  }

  /**
   * Mark a chunk as accessed without retrieving it
   */
  markAccessed(chunks: Map<number, string[][]>, startLine: number): void {
    if (chunks.has(startLine)) {
      this.accessTimes.set(startLine, Date.now());
    }
  }

  /**
   * Evict least recently used chunks until we're under the line limit
   */
  private evictIfNeeded(chunks: Map<number, string[][]>): Map<number, string[][]> {
    let totalLines = this.getTotalLines(chunks);

    // If we're under the limit, no eviction needed
    if (totalLines <= MAX_LINES_IN_MEMORY) {
      return chunks;
    }

    // Sort chunks by access time (oldest first)
    const chunksByAccessTime = Array.from(chunks.keys())
      .map((key) => ({
        key,
        accessTime: this.accessTimes.get(key) || 0,
        lineCount: chunks.get(key)?.length || 0
      }))
      .sort((a, b) => a.accessTime - b.accessTime);

    // Evict oldest chunks until we're under the limit
    const evictedChunks = new Map(chunks);
    let currentLines = totalLines;

    for (const chunk of chunksByAccessTime) {
      if (currentLines <= MAX_LINES_IN_MEMORY) {
        break; // We're under the limit now
      }

      // Evict this chunk
      evictedChunks.delete(chunk.key);
      this.accessTimes.delete(chunk.key);
      currentLines -= chunk.lineCount;

      console.log(
        "[ChunkManager] Evicted chunk:",
        chunk.key,
        `(${chunk.lineCount} lines)`,
        "- Remaining lines:",
        currentLines
      );
    }

    return evictedChunks;
  }
}
