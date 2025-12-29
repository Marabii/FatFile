use std::sync::{Arc, Mutex};

use crate::{
    services::{FileState, commands},
    types::{Command, Response},
};

pub struct CommandsProcessor;

impl CommandsProcessor {
    pub fn process_command(
        command: Command,
        file_state: Arc<Mutex<Option<FileState>>>,
    ) -> Response {
        let guard = match file_state.lock() {
            Ok(g) => g,
            Err(_poisoned) => {
                let response = Response::Error {
                    message: "FileState mutex is poisened.".to_string(),
                };
                eprintln!("{}", serde_json::to_string(&response).unwrap());
                std::process::exit(1);
            }
        };

        let fs = match guard.as_ref() {
            Some(f) => f,
            None => {
                let response = Response::Error {
                    message: "use OpenFile command before anything else.".to_string(),
                };
                eprintln!("{}", serde_json::to_string(&response).unwrap());
                std::process::exit(1);
            }
        };

        match command {
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
