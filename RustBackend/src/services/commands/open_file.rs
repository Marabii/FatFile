use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use regex::Regex;

use crate::{
    services::{FileProcessor, FileState},
    types::Response,
};

pub fn open_file(
    path: &str,
    pattern: Option<String>,
    nbr_columns: Option<u8>,
    file_state: &mut Arc<Mutex<Option<FileState>>>,
    watcher_handle: &mut Option<JoinHandle<()>>,
    should_stop: &Arc<AtomicBool>,
) -> Response {
    if let Some(handle) = watcher_handle.take() {
        should_stop.store(true, Ordering::Relaxed); //Hey thread, stop what you're doing.
        handle.join().expect("Thread panicked"); //i'm waiting for you...
        should_stop.store(false, Ordering::Relaxed); //reset the stop signal for another use.
    }

    let regex_pattern: Option<Regex> = pattern.and_then(|re_str| Regex::new(&re_str).ok());
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
        regex_pattern,
        nbr_columns,
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

    let guard = file_state.lock().unwrap();
    let line_count = guard.as_ref().unwrap().processor.index.len() as u64;
    Response::FileOpened { line_count }
}
