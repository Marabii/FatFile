# Log File Reader

This Rust backend is designed to work with large text/log files. It supports any ASCII-compatible encoding (UTF-8, ISO-8859-1, etc.) and UTF-16 (BE and LE).

You interact with it through simple JSON commands like `OpenFile`, `GetChunk`, and `Search` — all following the standard format described below.

## How to Use

### 1. Launch the Program
Run the binary in your terminal. You'll see a cursor waiting for your input.
(Make sure the JSON inputs are compacted before sending them)

### 2. Check File Encoding (Optional but Recommended)
Before opening a file, check if its encoding is supported:
```json
{"GetFileEncoding": {"path": "/path/to/your/file"}}
```

**Response:**
```json
{"Encoding": {"encoding": "UTF-8", "is_supported": true}}
```

**Note:** The program won't prevent you from opening unsupported files, but they'll be treated as UTF-8, which may result in gibberish.

### 3. Open Your File
Open the file for reading:
```json
{"OpenFile": {"path": "/path/to/your/file"}}
```

**Parameters:**
- **path**: The full/absolute path to your log file. Relative paths will result in an error.

**Response:**
```json
{"FileOpened": {"line_count": 4477844}}
```
You'll get back the total number of lines in the file.

### 4. Read Chunks of Data (Unparsed)
Once your file is open, you can immediately read specific portions using `GetChunk`:
```json
{"GetChunk": {"start_line": 0, "end_line": 2}}
```

**Parameters:**
- **start_line**: First line of the chunk you want
- **end_line**: Last line of the chunk you want

**Response (unparsed):**
```json
{
  "Chunk": {
    "data": [
      ["10.190.174.142 - - [03/Dec/2011:13:28:06 -0800] \"GET /images/filmpics/0000/2229/GOEMON-NUKI-000163.jpg HTTP/1.1\" 200 184976"],
      ["10.190.174.142 - - [03/Dec/2011:13:28:08 -0800] \"GET /assets/js/javascript_combined.js HTTP/1.1\" 200 20404"]
    ],
    "start_line": 0,
    "end_line": 2
  }
}
```

Notice each line is returned as a single string in an array (unparsed).

### 5. Detect Log Format (Optional)
To check if your log format is automatically recognized, use:
```json
{"GetParsingInformation": null}
```

**Response:**
```json
{"ParsingInformation": {"log_format": "NCSACombined"}}
```

**Supported log formats:**
- `CommonLogFormat` - Apache/Nginx Common Log Format
- `NCSACombined` - NCSA Combined/Extended Log Format
- `SyslogRFC3164` - BSD-style Syslog
- `SyslogRFC5424` - IETF Syslog Standard
- `W3CExtended` - W3C Extended (IIS)
- `CommonEventFormat` - CEF Format
- `Other` - Unrecognized format (you'll need to provide a custom pattern)

### 6. Parse the File (Optional)
To enable structured parsing of log lines, use the `ParseFile` command:

**For recognized formats:**
```json
{"ParseFile": {"log_format": "NCSACombined"}}
```

**For custom patterns (when log_format is "Other" or to override recognized formats):**
```json
{
  "ParseFile": {
    "log_format": "Other",
    "pattern": "(\\d{1,3}(?:\\.\\d{1,3}){3}) - - \\[(.*?)\\] \\\"(.*?)\\\" (\\d{3}) (\\d+|-)",
    "nbr_columns": 5
  }
}
```

**Parameters:**
- **log_format**: The detected or custom log format
- **pattern** (optional): Custom regex pattern with capture groups for parsing each line into columns
- **nbr_columns** (optional): Number of capture groups in your pattern

**Response:**
```json
{"ParsingInformation": {"log_format": "NCSACombined"}}
```

**Note:** You can always provide a custom pattern even if the format is recognized. Failing to provide parsing details will simply return log lines unparsed (no errors).

**After parsing, GetChunk returns structured data:**
```json
{
  "Chunk": {
    "data": [
      ["10.190.174.142", "03/Dec/2011:13:28:11 -0800", "GET /images/filmmediablock/360/GOEMON-NUKI-000163.jpg HTTP/1.1", "200", "60117"],
      ["10.190.174.142", "03/Dec/2011:13:28:10 -0800", "GET /images/filmmediablock/360/Chacha.jpg HTTP/1.1", "200", "109379"]
    ],
    "start_line": 0,
    "end_line": 2
  }
}
```

Notice how each line is now broken down into columns based on the parsing pattern.

### 7. Search Through the File
To find specific patterns across the entire file, use the `Search` command:
```json
{"Search": {"pattern": "03/Dec/2011:13:(?:2[5-9]:[0-5]\\d|30:00)"}}
```

This example finds all records in a 5-minute window between 13:25:00 and 13:30:00.

Since searching large files takes time, you'll receive progress updates:
```json
{"Progress": {"percent": 10.5}}
```

When the search completes (or hits the limit), you'll get the full results:
```json
{
  "SearchResults": {
    "matches": [
      {"line_number": 4477806, "column": 1, "start_index": 0, "end_index": 20}
    ],
    "total_matches": 37,
    "search_complete": true
  }
}
```

**Response fields:**
- **line_number**: Which line the match was found on
- **column**: Which column contains the match (based on your parsing pattern, 0 if unparsed)
- **start_index** / **end_index**: Position of the match within that column
- **search_complete**: `true` means the entire file was searched. `false` means the search stopped early after finding 1000+ matches. If this happens, try using a more specific search pattern.

## Features

- **Multi-encoding support**: Automatically detects and handles any ASCII-compatible encoding (UTF-8, ISO-8859-1, etc.) and UTF-16 (BE and LE)
- **File watching capabilities**: The program automatically reindexes the file when it detects that the file was truncated, and when new lines are added, it only indexes those for maximum performance
- **Fast indexing with memchr**: Leverages the powerful memchr library which uses SIMD and UTF-8's self-synchronizing properties to find all newline characters and effectively index a file with 4M+ lines in less than 2 seconds
- **Parallel search**: Uses Rayon to split the file into chunks and assign different chunks to different threads for maximum performance
- **Automatic log format detection**: Recognizes common log formats (Apache, Nginx, Syslog, IIS, CEF) and can automatically parse them
- **Custom parsing patterns**: Supports user-defined regex patterns for any log format

## Command Reference

| Command | Purpose | Parameters |
|---------|---------|------------|
| `GetFileEncoding` | Check file encoding | `path` |
| `OpenFile` | Open a file for reading | `path` |
| `GetParsingInformation` | Detect log format | none |
| `ParseFile` | Enable structured parsing | `log_format`, optional: `pattern`, `nbr_columns` |
| `GetChunk` | Read a range of lines | `start_line`, `end_line` |
| `Search` | Search for a pattern | `pattern` (regex) |
