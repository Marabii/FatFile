# Log File Reader

This Rust backend is designed to work with large text/log files in UTF-8 format. Files in other encodings won't work.

You interact with it through simple JSON commands like `OpenFile`, `GetChunk`, and `Search` — all following the standard format described below.

## How to Use

### 1. Launch the Program
Run the binary in your terminal. You'll see a cursor waiting for your input.
(make sure the json inputs are compacted before sending them)

### 2. Open Your File
The first command you need to run is `OpenFile`:
```json
{
  "OpenFile": {
    "path": "/path/to/your/file",
    "pattern": "(\\d{1,3}(?:\\.\\d{1,3}){3}) - - \\[(.*?)\\] \"(.*?)\" (\\d{3}) (\\d+|-)",
    "nbr_columns": 5
  }
}
```

**Parameters:**
- **path**: The full/absolute path to your log file, providing a relative path will result in an error.
- **pattern**: An optional regex pattern for parsing each line into columns. This helps with syntax highlighting and structured data extraction. The example pattern above works with Apache/Nginx access logs that look like:
```
  10.190.174.142 - - [03/Dec/2011:13:28:09 -0800] "GET /assets/img/home-logo.png HTTP/1.1" 200 3892
```
- **nbr_columns**: Optional, How many capture groups your regex pattern has (i.e., how many columns each line should be split into)

**Response:**
```json
{"FileOpened": {"line_count": 4477844}}
```
You'll get back the total number of lines in the file.

### 3. Read Chunks of Data
Once your file is open, you can read specific portions using `GetChunk`:
```json
{"GetChunk": {"start_line": 4477843, "end_line": 4477844}}
```

**Parameters:**
- **start_line**: First line of the chunk you want
- **end_line**: Last line of the chunk you want

**Response:**
```json
{
  "Chunk": {
    "data": [
      ["10.190.174.142", "03/Dec/2011:13:28:11 -0800", "GET /images/filmmediablock/360/GOEMON-NUKI-000163.jpg HTTP/1.1", "200", "60117"],
      ["10.190.174.142", "03/Dec/2011:13:28:10 -0800", "GET /images/filmmediablock/360/Chacha.jpg HTTP/1.1", "200", "109379"]
    ],
    "start_line": 4477840,
    "end_line": 4477842
  }
}
```

Notice how each line is broken down into columns based on the regex pattern you provided earlier.

### 4. Search Through the File
To find specific patterns across the entire file, use the `Search` command:
```json
{"Search": {"pattern": "03/Dec/2011:13:(?:2[5-9]:[0-5]\\d|30:00)"}}
```

This example finds all records in a 5-minute window between 13:25:00 and 13:30:00.

Since searching large files takes time, you'll receive progress updates:
```json
{"SearchProgress": {"percent": 10}}
```

When the search completes (or hits the limit), you'll get the full results:
```json
{
  "SearchResults": {
    "matches": [
      {"line_number": 4477806, "column": 1, "start_index": 0, "end_index": 20},
      ...
    ],
    "total_matches": 37,
    "search_complete": true
  }
}
```

**Response fields:**
- **line_number**: Which line the match was found on
- **column**: Which column contains the match (based on your parsing pattern)
- **start_index** / **end_index**: Position of the match within that column
- **search_complete**: `true` means the entire file was searched. `false` means the search stopped early after finding 1000+ matches. If this happens, try using a more specific search pattern.

## Features:
- **File watching capabilities**: The program automatically reindexes the file when it detects that the file was truncated and in the case where new lines were added to it, it only indexes those for maximum performance.
- **Memchr**: It uses the powerful library memchr which leverages how utf-8 files are self-synchronizing in order to find all \n charcters and effectively index a file with 4Mil+ lines in less than 2 seconds.
- **Parallel search**: It uses rayon to split the file into chunks then assign different chunks to different threads for maximum performance.

