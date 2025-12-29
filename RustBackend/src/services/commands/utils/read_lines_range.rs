use std::{
    fs::File,
    io::{BufReader, Read, Seek, SeekFrom},
};

use crate::{
    services::FileProcessor,
    types::{self, Response},
};

pub struct ReadLines {
    pub lines: Option<Vec<String>>,
    pub error: Option<types::Response>,
}

pub fn read_lines_range(processor: &FileProcessor, start_line: u64, end_line: u64) -> ReadLines {
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

    let file = match File::open(&processor.file_path) {
        Ok(f) => f,
        Err(e) => {
            let error = Response::Error {
                message: format!("Failed to open file: {}", e),
            };
            return ReadLines {
                lines: None,
                error: Some(error),
            };
        }
    };

    // Use BufReader on the reference (works for both &File and &local_file)
    let mut reader = BufReader::new(file);

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
