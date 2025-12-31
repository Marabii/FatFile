use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use crate::{
    services::{FileProcessor, FileState, file_processor::FileChangeType, commands::utils},
    types::Response,
};

pub fn open_file(
    path: &str,
    file_state: &mut Arc<Mutex<Option<FileState>>>,
    watcher_handle: &mut Option<JoinHandle<()>>,
    should_stop: &Arc<AtomicBool>,
) -> Response {
    if let Some(handle) = watcher_handle.take() {
        should_stop.store(true, Ordering::Relaxed); //Hey thread, stop what you're doing.
        handle.join().expect("Thread panicked"); //i'm waiting for you...
        should_stop.store(false, Ordering::Relaxed); //reset the stop signal for another use.
    }

    let processor = match FileProcessor::new(path) {
        Ok(p) => p,
        Err(err) => {
            let response = Response::Error {
                message: format!("Something went wrong when indexing the file: {}", err),
            };
            return response;
        }
    };

    *file_state = Arc::new(Mutex::new(Some(FileState {
        processor,
        regex_pattern: None,
        nbr_columns: None,
    })));

    let cloned_file_state = Arc::clone(file_state);
    let stop_flag = Arc::clone(should_stop);
    *watcher_handle = Some(thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_secs(1));

            if stop_flag.load(Ordering::Relaxed) {
                break; // Exit the loop
            }

            let mut file_state_guard = cloned_file_state.lock().unwrap();
            if let Some(ref mut fp) = *file_state_guard
                && let Ok(Some((change_type, old_count, new_count, new_lines))) = fp.processor.refresh_if_needed()
            {
                let response = match change_type {
                    FileChangeType::Truncated => Response::FileTruncated {
                        line_count: new_count,
                    },
                    FileChangeType::LinesAdded => {
                        // Parse the new lines using the same logic as GetChunk
                        let parsed_lines = utils::parse_data(
                            &fp.regex_pattern,
                            fp.nbr_columns,
                            &new_lines,
                            old_count,
                            false, // Don't show parsing errors for live tail
                        );

                        Response::LinesAdded {
                            old_line_count: old_count,
                            new_line_count: new_count,
                            new_lines: parsed_lines,
                        }
                    }
                };
                println!("{}", serde_json::to_string(&response).unwrap());
                      }
        }
    }));

    let guard = file_state.lock().unwrap();
    let line_count = guard.as_ref().unwrap().processor.index.len() as u64;
    Response::FileOpened { line_count }
}
