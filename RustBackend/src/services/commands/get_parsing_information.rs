use crate::{
    services::{commands::utils::log_format_patterns, file_processor::FileProcessor},
    types::Response,
};

pub fn get_parsing_information(processor: &FileProcessor) -> Response {
    // Read the first line
    let first_line = match processor.read_lines_range(0, 1) {
        Ok(lines) => {
            if lines.is_empty() {
                return Response::ParsingInformation {
                    log_format: log_format_patterns::detect_format(""),
                };
            }
            lines[0].clone()
        }
        Err(_) => {
            return Response::ParsingInformation {
                log_format: log_format_patterns::detect_format(""),
            };
        }
    };

    let log_format = log_format_patterns::detect_format(&first_line);

    Response::ParsingInformation { log_format }
}
