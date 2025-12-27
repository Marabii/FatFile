use std::{
    io::{self, BufRead},
    rc::Rc,
};
mod services;
mod types;
use services::file_processor::FileProcessor;

use crate::{
    services::commands_processor::CommandsProcessor,
    types::{Command, Response},
};

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let reader = stdin.lock();
    let mut processor: Rc<Option<FileProcessor>> = Rc::new(None);

    for line in reader.lines() {
        let input_str = line?;

        let command: Command = match serde_json::from_str(&input_str) {
            Ok(cmd) => cmd,
            Err(e) => {
                let response = Response::Error {
                    message: format!("Invalid JSON command: {}", e),
                };
                println!("{}", serde_json::to_string(&response).unwrap());
                continue;
            }
        };

        match command {
            Command::OpenFile { path } => {
                processor = Rc::new(Some(FileProcessor::new(path).unwrap_or_else(|err| {
                    eprintln!("Something went wrong: {}", err);
                    std::process::exit(1);
                })));

                if let Some(ref fp) = *processor {
                    let line_count = fp.index.len() as u64;
                    let data = Response::FileOpened { line_count };
                    let json = serde_json::to_string(&data).unwrap();
                    println!("{}", json);
                }
            }
            _ => {
                let response =
                    CommandsProcessor::process_command(command, processor.as_ref().as_ref());
                println!("{}", serde_json::to_string(&response).unwrap());
            }
        }
    }

    Ok(())
}
