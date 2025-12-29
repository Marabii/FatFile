use rayon::prelude::*;
use std::sync::{
    Arc,
    atomic::{AtomicU8, AtomicUsize, Ordering},
};

use crate::services::commands::utils;
use crate::{
    services::FileProcessor,
    types::{Response, SearchMatch},
};

/// Searches through all lines in the file for matches
pub fn search(
    processor: &FileProcessor,
    regex_pattern_parser: &Option<regex::Regex>,
    regex_pattern_search: &regex::Regex,
    nbr_columns: Option<u8>,
) -> Response {
    const CHUNK_SIZE: usize = 10_000; // Lines per chunk
    const MAX_RESULTS: usize = 1_000; // Stop after finding 1000 matches

    let line_count = processor.index.len();
    let total_chunks = line_count.div_ceil(CHUNK_SIZE);
    let mut search_complete = true;

    // Progress tracking
    let completed_chunks = Arc::new(AtomicUsize::new(0));
    let last_reported_percent = Arc::new(AtomicU8::new(0));

    // Report 0% at start
    println!("{{\"SearchProgress\":{{\"percent\":0}}}}");

    // Parallel search across chunks
    let matches: Vec<SearchMatch> = (0..line_count)
        .into_par_iter()
        .step_by(CHUNK_SIZE)
        .flat_map(|chunk_start| {
            let result = search_chunk(
                processor,
                regex_pattern_parser,
                regex_pattern_search,
                nbr_columns,
                chunk_start,
                CHUNK_SIZE.min(line_count - chunk_start),
            )
            .unwrap_or_else(|e| {
                // Log error but continue searching other chunks
                let response = Response::Info {
                    message: format!(
                        "Failed to search chunk starting at line {}: {}",
                        chunk_start, e
                    ),
                };
                eprintln!("{}", serde_json::to_string(&response).unwrap());

                Vec::new() // Return empty vec for failed chunk
            });

            // Update progress after chunk completes
            let finished = completed_chunks.fetch_add(1, Ordering::Relaxed) + 1;
            report_progress(finished, total_chunks, &last_reported_percent);

            result
        })
        .take_any(MAX_RESULTS)
        .collect();

    // Report 100% at the end
    println!("{{\"SearchProgress\":{{\"percent\":100}}}}");

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

fn search_chunk(
    processor: &FileProcessor,
    regex_pattern_parser: &Option<regex::Regex>,
    regex_pattern_search: &regex::Regex,
    nbr_columns: Option<u8>,
    start_line: usize,
    count: usize,
) -> Result<Vec<SearchMatch>, String> {
    // Read lines - return error if fails
    let read_result =
        utils::read_lines_range(processor, start_line as u64, (start_line + count) as u64);

    if let Some(error) = read_result.error {
        return Err(format!("Failed to read lines: {:?}", error));
    }

    let lines = read_result.lines.ok_or("No lines returned")?;
    let mut matches: Vec<SearchMatch> = Vec::new();

    let parsed_lines = utils::parse_data(
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
            println!("{{\"SearchProgress\":{{\"percent\":{}}}}}", milestone);
        }
    }
}
