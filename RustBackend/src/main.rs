use std::io::{self, BufRead};
mod services;
mod types;
use crate::{
    services::commands_processor::CommandsProcessor,
    types::{Command, Response},
};

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let reader = stdin.lock();
    let mut processor = CommandsProcessor::new();

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

        let response = processor.process_command(command);
        println!("{}", serde_json::to_string(&response).unwrap());
    }

    Ok(())
}
