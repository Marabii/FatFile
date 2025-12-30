use std::{
    sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}},
    thread::JoinHandle,
};

use crate::{
    services::{FileState, commands},
    types::{Command, Response},
};

pub struct CommandsProcessor {
    file_state: Arc<Mutex<Option<FileState>>>,
    watcher_handle: Option<JoinHandle<()>>,
    should_stop: Arc<AtomicBool>,
}

impl CommandsProcessor {
    pub fn new() -> Self {
        Self {
            file_state: Arc::new(Mutex::new(None)),
            watcher_handle: None,
            should_stop: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn process_command(&mut self, command: Command) -> Response {
        match command {
            // Handle commands that don't require the file to be opened.
            Command::GetFileEncoding { path } => commands::get_file_encoding(&path),

            // Handle the OpenFile command:
            Command::OpenFile {
                path,
                pattern,
                nbr_columns,
            } => commands::open_file(
                &path,
                pattern,
                nbr_columns,
                &mut self.file_state,
                &mut self.watcher_handle,
                &self.should_stop,
            ),

            // Handle all other commands that require an open file:
            other_command => {
                // For all other commands, ensure a file is opened first
                let guard = match self.file_state.lock() {
                    Ok(g) => g,
                    Err(_poisoned) => {
                        let response = Response::Error {
                            message: "FileState mutex is poisoned.".to_string(),
                        };
                        return response;
                    }
                };

                let fs = match guard.as_ref() {
                    Some(f) => f,
                    None => {
                        let response = Response::Error {
                            message: "use OpenFile command before parsing file contents."
                                .to_string(),
                        };
                        return response;
                    }
                };

                match other_command {
                    Command::GetChunk {
                        start_line,
                        end_line,
                    } => commands::get_chunk(
                        &fs.processor,
                        start_line,
                        end_line,
                        &fs.regex_pattern,
                        fs.nbr_columns,
                    ),
                    Command::Search { pattern } => {
                        // Compile the search regex
                        match regex::Regex::new(&pattern) {
                            Ok(search_regex) => commands::search(
                                &fs.processor,
                                &fs.regex_pattern,
                                &search_regex,
                                fs.nbr_columns,
                            ),
                            Err(e) => Response::Error {
                                message: format!("Invalid regex pattern: {}", e),
                            },
                        }
                    }
                    _ => Response::Error {
                        message: String::from("Command not implemented yet"),
                    },
                }
            }
        }
    }
}

impl Drop for CommandsProcessor {
    fn drop(&mut self) {
        if let Some(handle) = self.watcher_handle.take() {
            self.should_stop.store(true, Ordering::Relaxed);
            let _ = handle.join();
        }
    }
}
