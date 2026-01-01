# FatFile - Lightning-Fast Log Viewer for VSCode

[![FatFile Demo](https://img.youtube.com/vi/0UAOC2mh1PU/maxresdefault.jpg)](https://www.youtube.com/watch?v=0UAOC2mh1PU)

**Handle massive log files with ease.** FatFile is a high-performance VSCode extension built with a powerful Rust backend that lets you instantly open, search, and navigate log files with **millions of lines** without breaking a sweat.

No more crashes. No more freezing. No more waiting. Just instant access to your logs, no matter how large.

## Why FatFile?

Traditional text editors choke on large log files. Even VSCode's default editor struggles with files larger than a few MB. FatFile changes everything:

- **Instant Loading** - Open 10+ million line files in seconds
- **Blazing Fast Search** - Find needles in haystacks with regex-powered search
- **Intelligent Parsing** - Automatically detects and parses common log formats
- **Live Tail** - Monitor logs in real-time as they grow
- **Smart Memory Management** - Uses minimal RAM regardless of file size
- **Split-Screen Search** - View search results alongside the full log

Whether you're debugging production issues, analyzing server logs, or investigating security incidents, FatFile is your go-to tool for working with large text files.

## Getting Started

Using FatFile is incredibly simple:

1. **Install the extension** from the VSCode marketplace
2. **Right-click** on any `.log` or `.txt` file in your workspace
3. Select **"Open With..."** from the context menu
4. Choose **"FatFile Viewer"**
5. That's it! Your file is now open and ready to explore

## Features

### Automatic Format Detection

FatFile automatically detects popular log formats including Apache, Nginx, Common Log Format, and more. Your logs are instantly parsed into clean, readable columns.

![Custom Parser](https://github.com/Marabii/FatFile/blob/master/fatfile/images/Custom%20Parser.png?raw=true)

### Custom Parsing Rules

Need to parse a custom log format? No problem. FatFile lets you define your own regex patterns with capture groups to extract exactly the data you need.

- Define custom regex patterns
- Specify the number of columns
- Preview parsing results before applying
- Save patterns for reuse

### Powerful Search with Split-Screen Results

Search through millions of lines instantly with regex support. Results appear in a dedicated panel below the main viewer, making it easy to jump between matches without losing context.

![Split-Screen Search](https://github.com/Marabii/FatFile/blob/master/fatfile/images/Split-screen-search.png?raw=true)

**Search Features:**
- Lightning-fast regex search across the entire file
- Split-screen results panel
- Jump to any match with a single click
- Search result highlighting
- Match count display
- Navigate through matches with ease

### Live Tail Mode

Monitor log files in real-time as new lines are written. Perfect for watching application logs, server logs, or any file that's actively being updated.

![Live Tail](https://github.com/Marabii/FatFile/blob/master/fatfile/images/LiveTail.png?raw=true)

### Intelligent Navigation

- **Go to Line** - Jump directly to any line number
- **Virtual Scrolling** - Smooth navigation through millions of lines
- **Column Resizing** - Adjust column widths to fit your data
- **Keyboard Shortcuts** - Navigate efficiently without leaving the keyboard

## Technical Excellence

### Rust-Powered Backend

FatFile uses a high-performance Rust backend that handles all file operations with minimal memory overhead. The backend processes files line-by-line, ensuring you can work with multi-gigabyte files without consuming all your RAM.

### Smart Caching

Only the visible portions of your file are loaded into memory. As you scroll or search, FatFile intelligently caches the data you need while evicting what you don't, keeping memory usage consistently low.

### Cross-Platform Support

FatFile works seamlessly on:
- Windows (x64)
- macOS (Intel and Apple Silicon)
- Linux (x64)

Platform-specific binaries are automatically selected for optimal performance.

## Use Cases

- **DevOps Engineers** - Analyze server logs and application logs from production
- **Security Analysts** - Investigate security logs and audit trails
- **Developers** - Debug applications by examining detailed log files
- **System Administrators** - Monitor system logs and troubleshoot issues
- **Data Analysts** - Extract insights from large text-based datasets

## Performance Benchmarks

FatFile can handle files that would crash traditional editors:

- **10 million lines** - Opens instantly, scrolls smoothly
- **100+ MB files** - No lag, no freeze
- **Multi-gigabyte logs** - Handles with ease
- **Search** - Regex search across millions of lines in seconds
- **Memory Usage** - Stays under 100MB regardless of file size

## Why "FatFile"?

Because it handles fat files that other viewers can't. Simple as that.

## Contributing

Found a bug? Have a feature request? Contributions are welcome! Visit our [GitHub repository](https://github.com/Marabii/FatFile) to:

- Report issues
- Request features
- Submit pull requests
- View the source code

## License

FatFile is licensed under the **FatFile Non-Commercial License**.

- **Free for personal and non-commercial use**
- **Commercial use requires a separate license** - Contact the author for commercial licensing

See the [LICENSE](../LICENSE) file for complete terms and conditions.

Copyright (c) 2026 Hamza DADDA. All rights reserved.

---

**Download FatFile today and never struggle with large log files again.**

Made with performance in mind. Built with Rust. Designed for developers who need to get things done.
