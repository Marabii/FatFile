use serde::{Deserialize, Serialize};

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum LogFormat {
    CommonLogFormat,
    SyslogRFC3164,
    SyslogRFC5424,
    W3CExtended,
    CommonEventFormat,
    NCSACombined,
    Other,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum Command {
    GetFileEncoding {
        path: String,
    },
    OpenFile {
        path: String,
    },
    GetParsingInformation,
    ParseFile {
        log_format: LogFormat,

        #[serde(default)]
        pattern: Option<String>,

        //defaults to None - if not provided, no validation is performed
        #[serde(default)]
        nbr_columns: Option<u8>,
    },
    GetChunk {
        start_line: u64,
        end_line: u64,
    },
    Search {
        pattern: String,
    },
    Filter {
        pattern: String,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub enum Response {
    Encoding {
        encoding: String,
        is_supported: bool,
    },
    FileOpened {
        line_count: u64,
    },
    ParsingInformation {
        log_format: LogFormat,
    },
    Chunk {
        data: Vec<Vec<String>>,
        start_line: u64,
        end_line: u64,
    },
    SearchResults {
        matches: Vec<SearchMatch>,
        total_matches: u32,
        search_complete: bool,
    },
    // FilterResults {
    //     matches: Vec<LogMatch>,
    //     progress: f32,
    // },
    Progress {
        percent: f32,
        message: String,
    },
    Error {
        message: String,
    },
    Info {
        message: String,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchMatch {
    pub line_number: u32,
    pub column: u8,
    pub start_index: u16,
    pub end_index: u16,
}
