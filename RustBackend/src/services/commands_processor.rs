use std::io::{BufReader, Read, Seek, SeekFrom};

use crate::{
    services::file_processor::FileProcessor,
    types::{self, Command, Response},
};

pub struct CommandsProcessor;

impl CommandsProcessor {
    pub fn process_command(command: Command, processor: Option<&FileProcessor>) -> Response {
        let processor = processor.unwrap_or_else(|| {
            eprintln!("use OpenFile command before anything else.");
            std::process::exit(1);
        });

        match command {
            Command::GetChunk {
                start_line,
                end_line,
            } => CommandsProcessor::get_chunk(processor, start_line, end_line),
            Command::GetProgress => Response::Progress {
                percent: 0.0,
                message: String::from("Ready"),
            },

            _ => Response::Error {
                message: String::from("Command not implemented yet"),
            },
        }
    }

    fn get_chunk(processor: &FileProcessor, start_line: u64, end_line: u64) -> types::Response {
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
        let mut reader = BufReader::new(&processor.file);

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

        // Convert bytes to string, replacing invalid UTF-8 sequences
        let data = String::from_utf8_lossy(&buffer).to_string();

        Response::Chunk {
            data,
            start_line,
            end_line: actual_end_line,
        }
    }
}
