use memchr::memchr_iter;
use std::io::Read;
use std::{fs::File, path::Path};

pub struct FileProcessor {
    pub file_path: String,
    pub index: Vec<u64>,
    pub file: File,
}

/**FileProcessor opens the file and generates a vector
   containing all byte offsets where a new line was found.
*/
impl FileProcessor {
    pub fn new(file_path: String) -> std::io::Result<Self> {
        let path = Path::new(&file_path);
        if !path.is_absolute() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Path must be absolute",
            ));
        }
        let mut file = File::open(&file_path)?;
        let mut index: Vec<u64> = Vec::new();
        FileProcessor::create_index(&mut file, &mut index)?;
        Ok(Self {
            file_path,
            index,
            file,
        })
    }

    fn create_index(file: &mut File, index: &mut Vec<u64>) -> std::io::Result<()> {
        let mut buffer = [0u8; 64 * 1024]; // 64KB buffer size
        let mut total_offset = 0;

        let _: () = loop {
            let bytes_read = file.read(&mut buffer)?;
            if bytes_read == 0 {
                break; // End of file
            }

            // We only scan the bytes actually read into the buffer
            let chunk = &buffer[..bytes_read];

            for pos in memchr_iter(b'\n', chunk) {
                let absolute_pos = total_offset + pos;
                index.push(absolute_pos as u64);
            }

            total_offset += bytes_read;
        };
        Ok(())
    }
}
