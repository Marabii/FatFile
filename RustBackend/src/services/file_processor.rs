use encoding_rs::Encoding;
use memchr::memchr_iter;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::{fs::File, path::Path};

use crate::Response;
use crate::services::commands;

#[derive(Debug, Clone, PartialEq)]
pub enum FileChangeType {
    Truncated,
    LinesAdded { new_lines: Vec<Vec<String>> },
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum EncodingMode {
    AsciiCompatible, // UTF-8, Latin1, ASCII, etc.
    Utf16LE,         // \n is 0x0A 0x00
    Utf16BE,         // \n is 0x00 0x0A
}

pub struct FileProcessor {
    pub file_path: String,
    pub index: Vec<u64>,
    pub last_file_size: u64,
    mode: EncodingMode, // Cached mode to avoid string checks in loops
}

impl FileProcessor {
    pub fn new(file_path: &str) -> Result<Self, String> {
        let path = Path::new(&file_path);
        if !path.is_absolute() {
            return Err("Path must be absolute".to_string());
        }

        // Get file encoding support
        let encoding = commands::get_file_encoding(file_path);

        let (mut encoding_label, is_supported) = match encoding {
            Response::Encoding {
                encoding,
                is_supported,
            } => (encoding, is_supported),
            Response::Error { message } => {
                return Err(format!("Failed to get file encoding: {}", message));
            }
            _ => {
                return Err(String::from("Unexpected response from get_file_encoding"));
            }
        };

        // Check if encoding is supported
        if !is_supported {
            let response = Response::Info {
                message:
                    "encoding is not supported, file will be treated as if it has utf8 encoding"
                        .to_string(),
            };
            println!("{}", serde_json::to_string(&response).unwrap());
            encoding_label = String::from("utf-8");
        }

        // Resolve Encoding and determine Mode
        let encoding = match Encoding::for_label(encoding_label.as_bytes()) {
            Some(enc) => enc,
            None => {
                return Err(format!("Unknown encoding label: {}", encoding_label));
            }
        };

        let mode = if encoding.is_ascii_compatible() {
            EncodingMode::AsciiCompatible
        } else if encoding_label.eq_ignore_ascii_case("utf-16le") {
            EncodingMode::Utf16LE
        } else if encoding_label.eq_ignore_ascii_case("utf-16be") {
            EncodingMode::Utf16BE
        } else if encoding_label.eq_ignore_ascii_case("utf-16") {
            // Default to UTF-16LE if just "UTF-16" is detected
            EncodingMode::Utf16LE
        } else {
            return Err(format!("Unsupported file encoding: {}", encoding_label));
        };

        let mut file = File::open(file_path).map_err(|e| format!("couldn't open file: {}", e))?;
        let mut index: Vec<u64> = Vec::new();

        // Pass the determined mode to the indexer
        FileProcessor::scan_file(&mut file, &mut index, 0, mode)
            .map_err(|e| format!("couldn't scan the file: {}", e))?;

        Ok(Self {
            file_path: String::from(file_path),
            index,
            last_file_size: fs::metadata(file_path)
                .map_err(|e| format!("couldn't get metadata of file: {}", e))?
                .len(),
            mode,
        })
    }

    /// Core scanning logic extracted to handle both initial and incremental indexing
    fn scan_file(
        file: &mut File,
        index: &mut Vec<u64>,
        start_offset: u64,
        mode: EncodingMode,
    ) -> std::io::Result<u64> {
        let mut buffer = [0u8; 64 * 1024]; // 64KB
        let mut total_offset = start_offset;

        // State for carrying boundary bytes between chunks (crucial for UTF-16 split across buffers)
        let mut last_byte_of_prev_chunk: Option<u8> = None;

        loop {
            let bytes_read = file.read(&mut buffer)?;
            if bytes_read == 0 {
                break;
            }

            let chunk = &buffer[..bytes_read];

            match mode {
                EncodingMode::AsciiCompatible => {
                    // Original extremely fast logic
                    for pos in memchr_iter(b'\n', chunk) {
                        index.push(total_offset + pos as u64);
                    }
                }
                EncodingMode::Utf16LE => {
                    // \n is 0x0A followed by 0x00.
                    // 0x0A must be at an EVEN absolute offset.

                    // 1. Handle edge case: Did previous chunk end with 0x0A awaiting a 0x00?
                    if let Some(prev) = last_byte_of_prev_chunk {
                        // If prev chunk ended on 0x0A (even offset) and this starts with 0x00
                        if prev == 0x0A && chunk[0] == 0x00 && (total_offset - 1).is_multiple_of(2)
                        {
                            index.push(total_offset - 1);
                        }
                    }

                    for pos in memchr_iter(b'\n', chunk) {
                        // Search for 0x0Afatfile/src/webview/components/LogViewer.tsx
                        let abs_pos = total_offset + pos as u64;

                        // Check alignment: 0x0A must be the first byte of the pair (Even index)
                        if abs_pos.is_multiple_of(2) {
                            if pos + 1 < bytes_read {
                                // Fast path: check next byte in current buffer
                                if chunk[pos + 1] == 0x00 {
                                    index.push(abs_pos);
                                }
                            } else {
                                // Boundary case: 0x0A is the last byte of this chunk.
                                // We cannot confirm 0x00 yet. It will be checked in the next iteration
                                // via `last_byte_of_prev_chunk`.
                            }
                        }
                    }
                }
                EncodingMode::Utf16BE => {
                    // \n is 0x00 followed by 0x0A.
                    // 0x0A must be at an ODD absolute offset.

                    for pos in memchr_iter(b'\n', chunk) {
                        // Search for 0x0A
                        let abs_pos = total_offset + pos as u64;

                        // Check alignment: 0x0A must be the second byte of the pair (Odd index)
                        if !abs_pos.is_multiple_of(2) {
                            if pos > 0 {
                                // Check previous byte in current buffer
                                if chunk[pos - 1] == 0x00 {
                                    index.push(abs_pos); // Index points to 0x0A, usually we want start of line, but consistent with memchr finding \n
                                }
                            } else {
                                // Boundary case: 0x0A is the first byte. Check previous chunk's last byte.
                                if let Some(prev) = last_byte_of_prev_chunk
                                    && prev == 0x00
                                {
                                    index.push(abs_pos);
                                }
                            }
                        }
                    }
                }
            }

            // Save last byte for next iteration (boundary checks)
            if bytes_read > 0 {
                last_byte_of_prev_chunk = Some(chunk[bytes_read - 1]);
            }

            total_offset += bytes_read as u64;
        }

        Ok(total_offset)
    }

    pub fn refresh_if_needed(&mut self) -> Result<Option<(FileChangeType, u64, u64, Vec<String>)>, String> {
        let current_size = std::fs::metadata(&self.file_path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .len();

        if current_size < self.last_file_size {
            let old_line_count = self.index.len() as u64;
            self.full_reindex()
                .map_err(|e| format!("Failed to reindex file: {}", e))?;
            let new_line_count = self.index.len() as u64;
            // File was truncated, no new lines to return
            Ok(Some((FileChangeType::Truncated, old_line_count, new_line_count, Vec::new())))
        } else if current_size > self.last_file_size {
            let old_line_count = self.index.len() as u64;
            self.incremental_index()
                .map_err(|e| format!("Failed to incrementally index file: {}", e))?;
            let new_line_count = self.index.len() as u64;

            // Read the newly added lines
            let new_lines = if new_line_count > old_line_count {
                self.read_lines_range(old_line_count, new_line_count - 1)?
            } else {
                Vec::new()
            };

            Ok(Some((FileChangeType::LinesAdded, old_line_count, new_line_count, new_lines)))
        } else {
            Ok(None)
        }
    }

    fn full_reindex(&mut self) -> std::io::Result<()> {
        self.index.clear();
        let mut file = File::open(&self.file_path)?;

        let new_size = Self::scan_file(&mut file, &mut self.index, 0, self.mode)?;

        self.last_file_size = new_size;
        Ok(())
    }

    fn incremental_index(&mut self) -> std::io::Result<()> {
        let mut file = File::open(&self.file_path)?;

        // For UTF-16, we must be careful not to start reading in the middle of a character pair.
        // If last_file_size is odd (which shouldn't happen in valid UTF-16), we align it.
        let mut start_pos = self.last_file_size;

        // Safety adjustment for UTF-16 boundary consistency if file was appended oddly
        if matches!(self.mode, EncodingMode::Utf16LE | EncodingMode::Utf16BE)
            && !start_pos.is_multiple_of(2)
        {
            start_pos = start_pos.saturating_sub(1);
        }

        file.seek(SeekFrom::Start(start_pos))?;

        // For incremental, we need to populate index only with new items,
        // but we assume `scan_file` appends to the provided vector.
        let new_size = Self::scan_file(&mut file, &mut self.index, start_pos, self.mode)?;

        self.last_file_size = new_size;
        Ok(())
    }

    /// Read lines from start_line to end_line (inclusive) and decode them properly
    pub fn read_lines_range(&self, start_line: u64, end_line: u64) -> Result<Vec<String>, String> {
        let line_count = self.index.len() as u64;

        if line_count == 0 {
            return Err(String::from("File is empty"));
        }

        if start_line >= line_count {
            return Err(format!(
                "start_line ({}) out of bounds (file has {} lines)",
                start_line, line_count
            ));
        }

        if start_line > end_line {
            return Err(format!(
                "Invalid range: start_line ({}) > end_line ({})",
                start_line, end_line
            ));
        }

        // Clamp end_line to available lines
        let actual_end_line = end_line.min(line_count - 1);

        // Determine newline size based on encoding mode
        // UTF-16LE: newline is 0x0A 0x00 (2 bytes)
        // UTF-16BE: newline is 0x00 0x0A (2 bytes)
        // ASCII-compatible: newline is 0x0A (1 byte)
        let newline_size = match self.mode {
            EncodingMode::Utf16LE | EncodingMode::Utf16BE => 2,
            EncodingMode::AsciiCompatible => 1,
        };

        // Calculate byte positions to read from
        let start_pos = if start_line == 0 {
            0
        } else {
            self.index[(start_line - 1) as usize] + newline_size
        };

        // Read up to and including the newline at actual_end_line
        let end_pos = self.index[actual_end_line as usize] + newline_size;
        let bytes_to_read = (end_pos - start_pos) as usize;

        // Read the raw bytes
        let mut file =
            File::open(&self.file_path).map_err(|e| format!("Failed to open file: {}", e))?;

        file.seek(SeekFrom::Start(start_pos))
            .map_err(|e| format!("Failed to seek to position {}: {}", start_pos, e))?;

        let mut buffer = vec![0u8; bytes_to_read];
        file.read_exact(&mut buffer)
            .map_err(|e| format!("Failed to read {} bytes: {}", bytes_to_read, e))?;

        // Decode based on encoding mode
        let decoded_text = match self.mode {
            EncodingMode::AsciiCompatible => {
                // For ASCII-compatible encodings, we can use from_utf8_lossy
                // or use encoding_rs for more accuracy if we stored the exact encoding
                String::from_utf8_lossy(&buffer).into_owned()
            }
            EncodingMode::Utf16LE => {
                // Decode UTF-16LE
                let (decoded, _encoding, had_errors) = encoding_rs::UTF_16LE.decode(&buffer);
                if had_errors {
                    // Replace invalid sequences with �
                    decoded.into_owned()
                } else {
                    decoded.into_owned()
                }
            }
            EncodingMode::Utf16BE => {
                // Decode UTF-16BE
                let (decoded, _encoding, had_errors) = encoding_rs::UTF_16BE.decode(&buffer);
                if had_errors {
                    // Replace invalid sequences with �
                    decoded.into_owned()
                } else {
                    decoded.into_owned()
                }
            }
        };
        let decoded_text = decoded_text.trim_start_matches('\u{FEFF}');
        // Split into lines
        let lines = decoded_text
            .lines()
            .map(|s| s.to_string())
            .collect::<Vec<String>>();

        Ok(lines)
    }
}
