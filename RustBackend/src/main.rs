use std::{
    io::{self, BufRead},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};
mod services;
mod types;
use crate::{
    services::{FileProcessor, FileState, commands_processor::CommandsProcessor},
    types::{Command, Response},
};
use regex::Regex;

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let reader = stdin.lock();
    let mut file_state: Arc<Mutex<Option<FileState>>> = Arc::new(Mutex::new(None));
    let mut watcher_handle: Option<JoinHandle<()>> = None;
    let should_stop = Arc::new(AtomicBool::new(false));

    for line in reader.lines() {
        let input_str = line?;

        let command: Command = match serde_json::from_str(&input_str) {
            Ok(cmd) => cmd,
            Err(e) => {
                let response = Response::Info {
                    message: format!("Invalid JSON command: {}", e),
                };
                eprintln!("{}", serde_json::to_string(&response).unwrap());
                continue;
            }
        };

        match command {
            Command::OpenFile {
                path,
                pattern,
                nbr_columns,
            } => {
                if let Some(handle) = watcher_handle.take() {
                    should_stop.store(true, Ordering::Relaxed); //Hey thread, stop what you're doing.
                    handle.join().expect("Thread panicked"); //i'm waiting for you...
                    should_stop.store(false, Ordering::Relaxed); //reset the stop signal for another use.
                }

                let regex_pattern: Option<Regex> =
                    pattern.and_then(|re_str| Regex::new(&re_str).ok());

                file_state = Arc::new(Mutex::new(Some(FileState {
                    processor: FileProcessor::new(path).unwrap_or_else(|err| {
                        let response = Response::Error {
                            message: format!(
                                "Something went wrong when indexing the file: {}",
                                err
                            ),
                        };
                        eprintln!("{}", serde_json::to_string(&response).unwrap());
                        std::process::exit(1);
                    }),
                    regex_pattern,
                    nbr_columns,
                })));

                let cloned_file_state = Arc::clone(&file_state);
                let stop_flag = Arc::clone(&should_stop);
                watcher_handle = Some(thread::spawn(move || {
                    loop {
                        thread::sleep(Duration::from_secs(1));

                        if stop_flag.load(Ordering::Relaxed) {
                            break; // Exit the loop
                        }

                        let mut file_state_guard = cloned_file_state.lock().unwrap();
                        if let Some(ref mut fp) = *file_state_guard
                            && let Ok(changed) = fp.processor.refresh_if_needed()
                            && changed
                        {
                            let info_message = Response::Info {
                                message: "File updated: re-indexed".to_string(),
                            };
                            println!("{}", serde_json::to_string(&info_message).unwrap());
                        }
                    }
                }));

                let cloned_file_state = Arc::clone(&file_state);
                let guard = match cloned_file_state.lock() {
                    Ok(g) => g,
                    Err(_poisoned) => {
                        let response = Response::Error {
                            message: "Something went wrong with the watcher thread."
                                .to_string(),
                        };
                        eprintln!("{}", serde_json::to_string(&response).unwrap());
                        std::process::exit(1);
                    }
                };

                if let Some(fs) = guard.as_ref() {
                    let line_count = fs.processor.index.len() as u64;
                    let data = Response::FileOpened { line_count };
                    println!("{}", serde_json::to_string(&data).unwrap());
                }
            }
            _ => {
                let response = CommandsProcessor::process_command(command, Arc::clone(&file_state));
                println!("{}", serde_json::to_string(&response).unwrap());
            }
        }
    }
    if let Some(handle) = watcher_handle.take() {
        should_stop.store(true, Ordering::Relaxed);
        handle.join().expect("Thread panicked");
    }
    Ok(())
}
