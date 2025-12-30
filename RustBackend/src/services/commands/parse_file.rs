use std::sync::{Arc, Mutex};

use regex::Regex;

use crate::services::commands::utils::log_format_patterns;
use crate::types::Response;
use crate::{services::FileState, types::LogFormat};

pub fn parse_file(
    file_state: Arc<Mutex<Option<FileState>>>,
    log_format: LogFormat,
    pattern: Option<String>,
    nbr_columns: Option<u8>,
) -> Response {
    let final_regex = pattern
        .and_then(|re_str| Regex::new(&re_str).ok())
        .or_else(|| log_format_patterns::get_pattern(&log_format));

    let final_columns = nbr_columns.or_else(|| log_format_patterns::get_column_count(&log_format));

    if let Some(fs) = file_state.lock().unwrap().as_mut() {
        fs.regex_pattern = final_regex;
        fs.nbr_columns = final_columns;
    }

    Response::ParsingInformation { log_format }
}
