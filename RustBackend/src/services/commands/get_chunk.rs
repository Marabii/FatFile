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
    let result = utils::read_lines_range(processor, None, start_line, end_line);
    if result.error.is_some() {
        return result.error.unwrap();
    }

    let lines = result.lines.unwrap();
    // Parse the lines using the regex pattern
    let data = utils::parse_data(regex_pattern, nbr_columns, &lines, start_line, true);

    Response::Chunk {
        data,
        start_line,
        end_line: start_line + lines.len() as u64,
    }
}
