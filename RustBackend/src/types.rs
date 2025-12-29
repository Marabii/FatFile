use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub enum Command {
    OpenFile {
        path: String,

        //defaults to None
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
    FileOpened {
        line_count: u64,
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
