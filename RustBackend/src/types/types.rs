use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub enum Command {
    OpenFile { path: String },
    GetChunk { start_line: u64, end_line: u64 },
    Search { pattern: String },
    Filter { pattern: String },
    GetProgress,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum Response {
    FileOpened {
        line_count: u64,
    },
    Chunk {
        data: String,
        start_line: u64,
        end_line: u64,
    },
    // SearchResults {
    //     matches: Vec<LogMatch>,
    //     progress: f32,
    // },
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
}
