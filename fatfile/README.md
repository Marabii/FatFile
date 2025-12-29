# FatFile Viewer

A high-performance VS Code extension for viewing and searching large log files (100MB+) without consuming excessive RAM. Built with a Rust backend for blazing-fast performance and a React frontend with TailwindCSS for a professional, modern UI.

## Features

- **High Performance**: View files with millions of lines without loading the entire file into memory
- **Virtual Scrolling**: Smooth scrolling through large files using react-window
- **Powerful Search**: Regex-based search with real-time progress indicators
- **Syntax Highlighting**: Automatic column-based syntax highlighting for structured logs
- **File Watching**: Automatically detects and re-indexes when files change
- **Beautiful UI**: Modern, professional interface that matches VS Code's theme

## Prerequisites

Before using the extension, you need to compile the Rust backend:

```bash
cd ../RustBackend
cargo build --release
```

The extension will automatically find the binary in one of these locations:
- `../RustBackend/target/release/FatFile`
- `../RustBackend/target/debug/FatFile`
- `../target/release/FatFile`
- `../target/debug/FatFile`

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the extension:
```bash
npm run compile
```

## Development

Run the extension in development mode:

```bash
npm run watch
```

Then press F5 in VS Code to launch the Extension Development Host.

## Usage

### Opening Files

The extension registers as a custom editor for `.log` and `.txt` files. You have two options:

1. **Right-click a log/txt file** → Select "Open With" → Choose "FatFile Viewer"
2. **Use the command palette** (Ctrl+Shift+P) → Type "Open with FatFile Viewer"

### Search

1. Enter a regex pattern in the search bar (e.g., `error|warning`, `\d{3}`)
2. Click "Search" or press Enter
3. Watch the progress bar as the search runs
4. Results are highlighted and the view automatically scrolls to the first match

### Column-Based Syntax Highlighting

For Apache/Nginx access logs (and similar structured formats), the extension automatically applies syntax highlighting to parsed columns:

Default pattern for `.log` files:
```regex
(\d{1,3}(?:\.\d{1,3}){3}) - - \[(.*?)\] "(.*?)" (\d{3}) (\d+|-)
```

This highlights:
- IP addresses (cyan)
- Timestamps (orange)
- HTTP requests (yellow)
- Status codes (blue)
- Response sizes (purple)

## Architecture

### Backend (Rust)
- Fast file indexing using memchr
- Parallel search with rayon
- Efficient chunked reading
- File watching capabilities

### Frontend (React + TypeScript + TailwindCSS)
- Virtual scrolling for millions of lines
- Real-time search progress
- Syntax highlighting
- VS Code theme integration

### Communication
- Backend runs as a child process
- JSON-based command/response protocol
- Chunks loaded on-demand for memory efficiency

## Performance

- **Indexing**: 4M+ lines in < 2 seconds
- **Memory**: Only loaded chunks are in memory (~100 lines at a time)
- **Search**: Parallel search across all CPU cores
- **Scrolling**: Smooth 60fps scrolling with virtual rendering

## Configuration

The extension can be customized by modifying:
- **Search limit**: Max 1000 results (configurable in backendManager.ts)
- **Chunk size**: 100 lines per chunk (configurable in LogViewer.tsx)
- **Regex patterns**: Custom patterns for different log formats

## Troubleshooting

**Extension doesn't activate:**
- Ensure the Rust backend is compiled (`cargo build --release`)
- Check the VS Code Output panel for errors

**Search is slow:**
- Try a more specific regex pattern
- Large result sets (>1000) will be truncated

**File not updating:**
- The backend watches for file changes every 1 second
- Large truncations trigger a full re-index

## License

MIT

## Credits

Built with:
- Rust for the blazing-fast backend
- React for the interactive UI
- TailwindCSS for beautiful styling
- react-window for virtual scrolling
- VS Code Extension API
