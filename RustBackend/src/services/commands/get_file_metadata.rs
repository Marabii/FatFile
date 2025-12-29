use std::io::Read;
use std::{fs::File, io::BufReader, path::Path};

use encoding_rs::Encoding;

use crate::Response;

pub fn get_file_metadata(path: &str) -> Response {
    let result = get_file_metadata_helper(path);
    let encoding_name = match result {
        Ok(name) => name,
        Err(err) => {
            eprintln!("{}", serde_json::to_string(&err).unwrap());
            std::process::exit(1);
        }
    };

    let is_supported = ["UTF-16BE", "UTF-16LE", "UTF-16"]
        .iter()
        .any(|s| s.eq_ignore_ascii_case(&encoding_name));

    let enc = match Encoding::for_label(encoding_name.as_bytes()) {
        Some(v) => v,
        None => {
            return Response::MetaData {
                encoding: encoding_name,
                is_supported: false,
            };
        }
    };

    let is_supported = is_supported || enc.is_ascii_compatible();

    Response::MetaData {
        encoding: encoding_name,
        is_supported,
    }
}

fn get_file_metadata_helper(path: &str) -> Result<String, Response> {
    let path = Path::new(path);
    if !path.is_absolute() {
        let response = Response::Error {
            message: "Path must be absolute".to_string(),
        };
        return Err(response);
    }

    let file = match File::open(path) {
        Ok(f) => f,
        Err(e) => {
            let response = Response::Error {
                message: format!("Couldn't open the file: {}", e),
            };
            return Err(response);
        }
    };

    let reader = BufReader::new(file);

    let mut buffer = Vec::with_capacity(8192);
    reader
        .take(8192)
        .read_to_end(&mut buffer)
        .map_err(|e| Response::Error {
            message: format!("Failed to read file: {}", e),
        })?;

    // Use chardet for reliable encoding detection
    let result = chardet::detect(&buffer);
    Ok(result.0)
}
