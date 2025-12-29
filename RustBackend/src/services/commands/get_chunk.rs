use crate::{
    services::{commands::utils, file_processor::FileProcessor},
    types::Response,
};

pub fn get_chunk(
    processor: &FileProcessor,
    start_line: u64,
    end_line: u64,
    regex_pattern: &Option<regex::Regex>,
    nbr_columns: Option<u8>,
) -> Response {
    let lines = match processor.read_lines_range(start_line, end_line) {
        Ok(lines) => lines,
        Err(err) => return Response::Error { message: err },
    };

    // Parse the lines using the regex pattern
    let data = utils::parse_data(regex_pattern, nbr_columns, &lines, start_line, true);

    Response::Chunk {
        data,
        start_line,
        end_line: start_line + lines.len() as u64,
    }
}
