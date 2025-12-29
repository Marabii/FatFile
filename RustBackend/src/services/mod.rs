pub mod commands;
pub mod commands_processor;
mod file_processor;
pub use file_processor::FileProcessor;

pub struct FileState {
    pub processor: FileProcessor,
    pub regex_pattern: Option<regex::Regex>,
    pub nbr_columns: Option<u8>,
}
