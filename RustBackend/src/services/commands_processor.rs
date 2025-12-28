use std::{
    fs::File,
    io::{BufReader, Read, Seek, SeekFrom},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU8, AtomicUsize, Ordering},
    },
};

use crate::{
    services::{FileState, file_processor::FileProcessor},
    types::{self, Command, Response, SearchMatch},
};

use rayon::prelude::*;

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
            Command::Search { pattern } => {
                // Compile the search regex
                match regex::Regex::new(&pattern) {
                    Ok(search_regex) => CommandsProcessor::search(
                        &fs.processor,
                        &fs.regex_pattern,
                        &search_regex,
                        fs.nbr_columns,
                    ),
                    Err(e) => Response::Error {
                        message: format!("Invalid regex pattern: {}", e),
                    },
                }
            }
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
        let result = Self::read_lines_range(processor, None, start_line, end_line);
        if result.error.is_some() {
            return result.error.unwrap();
        }

        let lines = result.lines.unwrap();
        // Parse the lines using the regex pattern
        let data =
            CommandsProcessor::parse_data(regex_pattern, nbr_columns, &lines, start_line, true);

        Response::Chunk {
            data,
            start_line,
            end_line: start_line + lines.len() as u64,
        }
    }

    fn read_lines_range(
        processor: &FileProcessor,
        file: Option<&File>,
        start_line: u64,
        end_line: u64,
    ) -> ReadLines {
        let line_count = processor.index.len() as u64;

        if line_count == 0 {
            let error = Response::Error {
                message: String::from("File is empty"),
            };
            return ReadLines {
                lines: None,
                error: Some(error),
            };
        }

        if start_line >= line_count {
            let error = Response::Error {
                message: format!(
                    "start_line ({}) out of bounds (file has {} lines)",
                    start_line, line_count
                ),
            };
            return ReadLines {
                lines: None,
                error: Some(error),
            };
        }

        if start_line > end_line {
            let error = Response::Error {
                message: format!(
                    "Invalid range: start_line ({}) > end_line ({})",
                    start_line, end_line
                ),
            };
            return ReadLines {
                lines: None,
                error: Some(error),
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

        // Determine which file handle to use
        // We declare `local_file` here to extend its lifetime to the end of the function if initialized
        let local_file;

        let file_ref = match file {
            Some(f) => f,
            None => match File::open(&processor.file_path) {
                Ok(f) => {
                    local_file = f;
                    &local_file
                }
                Err(e) => {
                    let error = Response::Error {
                        message: format!("Failed to open file: {}", e),
                    };
                    return ReadLines {
                        lines: None,
                        error: Some(error),
                    };
                }
            },
        };

        // Use BufReader on the reference (works for both &File and &local_file)
        let mut reader = BufReader::new(file_ref);

        if let Err(e) = reader.seek(SeekFrom::Start(start_pos)) {
            let error = Response::Error {
                message: format!("Failed to seek to position {}: {}", start_pos, e),
            };
            return ReadLines {
                lines: None,
                error: Some(error),
            };
        }

        let mut buffer = vec![0u8; bytes_to_read];

        if let Err(e) = reader.read_exact(&mut buffer) {
            let error = Response::Error {
                message: format!("Failed to read {} bytes: {}", bytes_to_read, e),
            };
            return ReadLines {
                lines: None,
                error: Some(error),
            };
        }

        // Convert bytes to a list of strings (different lines), replacing invalid UTF-8 sequences
        let lines = String::from_utf8_lossy(&buffer)
            .lines()
            .map(|s| s.to_string())
            .collect::<Vec<String>>();

        ReadLines {
            lines: Some(lines),
            error: None,
        }
    }

    fn parse_data(
        regex_pattern: &Option<regex::Regex>,
        nbr_columns: Option<u8>,
        data: &[String],
        start_line: u64,
        show_errors: bool,
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
        if total_failures > 0 && show_errors {
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

    /// Searches through all lines in the file for matches
    pub fn search(
        processor: &FileProcessor,
        regex_pattern_parser: &Option<regex::Regex>,
        regex_pattern_search: &regex::Regex,
        nbr_columns: Option<u8>,
    ) -> types::Response {
        const CHUNK_SIZE: usize = 10_000; // Lines per chunk
        const MAX_RESULTS: usize = 1_000; // Stop after finding 1000 matches

        let line_count = processor.index.len();
        let total_chunks = line_count.div_ceil(CHUNK_SIZE);
        let mut search_complete = true;

        let file = match File::open(&processor.file_path) {
            Ok(f) => f,
            Err(e) => {
                return Response::Error {
                    message: format!("Failed to open file: {}", e),
                };
            }
        };

        // Progress tracking
        let completed_chunks = Arc::new(AtomicUsize::new(0));
        let last_reported_percent = Arc::new(AtomicU8::new(0));

        // Report 0% at start
        eprintln!("{{\"SearchProgress\":{{\"percent\":0}}}}");

        // Parallel search across chunks
        let matches: Vec<SearchMatch> = (0..line_count)
            .into_par_iter()
            .step_by(CHUNK_SIZE)
            .flat_map(|chunk_start| {
                let result = Self::search_chunk(
                    processor,
                    regex_pattern_parser,
                    regex_pattern_search,
                    nbr_columns,
                    chunk_start,
                    CHUNK_SIZE.min(line_count - chunk_start),
                    &file,
                )
                .unwrap_or_else(|e| {
                    // Log error but continue searching other chunks
                    eprintln!(
                        "Failed to search chunk starting at line {}: {}",
                        chunk_start, e
                    );
                    Vec::new() // Return empty vec for failed chunk
                });

                // Update progress after chunk completes
                let finished = completed_chunks.fetch_add(1, Ordering::Relaxed) + 1;
                Self::report_progress(finished, total_chunks, &last_reported_percent);

                result
            })
            .take_any(MAX_RESULTS)
            .collect();

        // Report 100% at the end
        eprintln!("{{\"SearchProgress\":{{\"percent\":100}}}}");

        let nbr_matches = matches.len();
        if nbr_matches >= MAX_RESULTS {
            search_complete = false;
        }

        Response::SearchResults {
            matches,
            total_matches: nbr_matches as u32,
            search_complete,
        }
    }

    /// Reports progress milestones (10%, 20%, 30%, etc.) to stderr as JSON
    fn report_progress(completed: usize, total: usize, last_reported: &Arc<AtomicU8>) {
        let percent = ((completed * 100) / total) as u8;
        let milestone = (percent / 10) * 10; // Snap to 0, 10, 20, 30, ...
        let last = last_reported.load(Ordering::Relaxed);

        // Only report if we've reached a new milestone (and not 100%, that's reported separately)
        if milestone > last && milestone < 100 {
            // Use compare_exchange to ensure only one thread reports this milestone
            if last_reported
                .compare_exchange(last, milestone, Ordering::SeqCst, Ordering::Relaxed)
                .is_ok()
            {
                eprintln!("{{\"SearchProgress\":{{\"percent\":{}}}}}", milestone);
            }
        }
    }

    fn search_chunk(
        processor: &FileProcessor,
        regex_pattern_parser: &Option<regex::Regex>,
        regex_pattern_search: &regex::Regex,
        nbr_columns: Option<u8>,
        start_line: usize,
        count: usize,
        file: &File,
    ) -> Result<Vec<SearchMatch>, String> {
        // Read lines - return error if fails
        let read_result = Self::read_lines_range(
            processor,
            Some(file),
            start_line as u64,
            (start_line + count) as u64,
        );

        if let Some(error) = read_result.error {
            return Err(format!("Failed to read lines: {:?}", error));
        }

        let lines = read_result.lines.ok_or("No lines returned")?;
        let mut matches: Vec<SearchMatch> = Vec::new();

        let parsed_lines = Self::parse_data(
            regex_pattern_parser,
            nbr_columns,
            &lines,
            start_line as u64,
            false, // Don't show parsing errors during search
        );

        // Search within each parsed line's columns
        for (line_idx, columns) in parsed_lines.iter().enumerate() {
            for (col_idx, column) in columns.iter().enumerate() {
                // Find all matches in this column
                for mat in regex_pattern_search.find_iter(column) {
                    matches.push(SearchMatch {
                        line_number: (start_line + line_idx) as u32,
                        column: col_idx as u8,
                        start_index: mat.start() as u16,
                        end_index: mat.end() as u16,
                    });
                }
            }
        }

        Ok(matches)
    }
}

struct ReadLines {
    lines: Option<Vec<String>>,
    error: Option<types::Response>,
}
