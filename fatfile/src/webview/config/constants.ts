/**
 * Application-wide constants
 */

/** Number of lines per chunk */
export const CHUNK_SIZE = 100;

/** Number of lines to show in parsing preview */
export const PREVIEW_LINE_COUNT = 10;

/**
 * Maximum number of lines to keep in memory (LRU cache)
 * This is used by ChunkManager for line-based eviction.
 *
 * Why line-based instead of chunk-based?
 * - More predictable memory usage (lines consume memory, not chunk objects)
 * - Flexible: allows many sparse chunks or fewer dense chunks
 * - Better for search results: We request individual matching lines only
 *   (not full 100-line chunks), so 2000 search results = 2000 lines
 */
export const MAX_LINES_IN_MEMORY = 2000;
