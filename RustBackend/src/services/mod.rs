use crate::services::file_processor::FileProcessor;

pub mod commands_processor;
pub mod file_processor;

pub struct FileState {
    pub processor: FileProcessor,
    pub regex_pattern: Option<regex::Regex>,
    pub nbr_columns: Option<u8>,
}
