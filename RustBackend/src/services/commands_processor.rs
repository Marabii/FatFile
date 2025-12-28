use std::{
    fs::File,
    io::{BufReader, Read, Seek, SeekFrom},
    sync::{Arc, Mutex},
};

use crate::{
    services::{FileState, file_processor::FileProcessor},
    types::{self, Command, Response},
};

pub struct CommandsProcessor;

impl CommandsProcessor {
    pub fn process_command(
        command: Command,
        file_state: Arc<Mutex<Option<FileState>>>,
    ) -> Response {
        let guard = match file_state.lock() {
            Ok(g) => g,
            Err(_poisoned) => {
                eprintln!("Something went wrong");
                std::process::exit(1);
            }
        };

        let fs = match guard.as_ref() {
            Some(f) => f,
            None => {
                eprintln!("use OpenFile command before anything else.");
                std::process::exit(1);
            }
        };

        match command {
            Command::GetChunk {
                start_line,
                end_line,
            } => CommandsProcessor::get_chunk(
                &fs.processor,
                start_line,
                end_line,
                &fs.regex_pattern,
                fs.nbr_columns,
            ),
            Command::GetProgress => Response::Progress {
                percent: 0.0,
                message: String::from("Ready"),
            },

            _ => Response::Error {
                message: String::from("Command not implemented yet"),
            },
        }
    }

    fn get_chunk(
        processor: &FileProcessor,
        start_line: u64,
        end_line: u64,
        regex_pattern: &Option<regex::Regex>,
        nbr_columns: Option<u8>,
    ) -> types::Response {
        let line_count = processor.index.len() as u64;

        if line_count == 0 {
            return Response::Error {
                message: String::from("File is empty"),
            };
        }

        if start_line >= line_count {
            return Response::Error {
                message: format!(
                    "start_line ({}) out of bounds (file has {} lines)",
                    start_line, line_count
                ),
            };
        }

        if start_line > end_line {
            return Response::Error {
                message: format!(
                    "Invalid range: start_line ({}) > end_line ({})",
                    start_line, end_line
                ),
            };
        }

        // Clamp end_line to available lines
        let actual_end_line = end_line.min(line_count - 1);

        // Calculate byte positions to read from
        // Line 0 starts at byte 0, other lines start after the previous newline
        let start_pos = if start_line == 0 {
            0
        } else {
            processor.index[(start_line - 1) as usize] + 1
        };

        // Read up to and including the newline at actual_end_line
        let end_pos = processor.index[actual_end_line as usize] + 1;
        let bytes_to_read = (end_pos - start_pos) as usize;

        // Read the data from file
        let file = match File::open(&processor.file_path) {
            Ok(f) => f,
            Err(e) => {
                return Response::Error {
                    message: format!("Failed to open file: {}", e),
                };
            }
        };
        let mut reader = BufReader::new(file);

        if let Err(e) = reader.seek(SeekFrom::Start(start_pos)) {
            return Response::Error {
                message: format!("Failed to seek to position {}: {}", start_pos, e),
            };
        }

        let mut buffer = vec![0u8; bytes_to_read];

        if let Err(e) = reader.read_exact(&mut buffer) {
            return Response::Error {
                message: format!("Failed to read {} bytes: {}", bytes_to_read, e),
            };
        }

        // Convert bytes to a list of strings (different lines), replacing invalid UTF-8 sequences
        let lines: Vec<String> = String::from_utf8_lossy(&buffer)
            .lines()
            .map(|s| s.to_string())
            .collect();

        // Parse the lines using the regex pattern
        let data = CommandsProcessor::parse_data(regex_pattern, nbr_columns, &lines, start_line);

        Response::Chunk {
            data,
            start_line,
            end_line: actual_end_line,
        }
    }

    fn parse_data(
        regex_pattern: &Option<regex::Regex>,
        nbr_columns: Option<u8>,
        data: &[String],
        start_line: u64,
    ) -> Vec<Vec<String>> {
        // If no regex, just wrap each line
        let Some(regex) = regex_pattern else {
            return data.iter().map(|line| vec![line.clone()]).collect();
        };

        // Only track first 6 failed lines (5 to show + 1 to detect "more")
        let mut failed_lines: Vec<u64> = Vec::new();
        let mut total_failures = 0usize;
        let mut results = Vec::new();

        for (i, line) in data.iter().enumerate() {
            if let Some(caps) = regex.captures(line) {
                // Extract capture groups (skip index 0 which is the full match)
                let groups: Vec<String> = caps
                    .iter()
                    .skip(1)
                    .filter_map(|m| m.map(|m| m.as_str().to_string()))
                    .collect();

                // Validate column count if user provided one
                let is_valid = if let Some(expected) = nbr_columns {
                    groups.len() == expected as usize
                } else {
                    true
                };

                if is_valid {
                    results.push(groups);
                } else {
                    // Column count mismatch - fall back to raw line
                    results.push(vec![line.clone()]);
                    if failed_lines.len() < 6 {
                        failed_lines.push(start_line + i as u64);
                    }
                    total_failures += 1;
                }
            } else {
                // Regex didn't match - fall back to raw line
                results.push(vec![line.clone()]);
                if failed_lines.len() < 6 {
                    failed_lines.push(start_line + i as u64);
                }
                total_failures += 1;
            }
        }

        // Report failures (show first 5)
        if total_failures > 0 {
            let preview: Vec<String> = failed_lines.iter().take(5).map(|n| n.to_string()).collect();
            let suffix = if total_failures > 5 { "..." } else { "" };
            eprintln!(
                "Failed to parse {} line(s): [{}]{}",
                total_failures,
                preview.join(", "),
                suffix
            );
        }

        results
    }
}
