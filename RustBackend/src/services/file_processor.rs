use memchr::memchr_iter;
use std::fs::metadata;
use std::io::{Read, Seek, SeekFrom};
use std::{fs::File, path::Path};

pub struct FileProcessor {
    pub file_path: String,
    pub index: Vec<u64>,
    pub last_file_size: u64,
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
            file_path: file_path.clone(),
            index,
            last_file_size: metadata(file_path)?.len(),
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

    pub fn refresh_if_needed(&mut self) -> std::io::Result<bool> {
        let current_size = std::fs::metadata(&self.file_path)?.len();

        // Compare with last known size
        if current_size < self.last_file_size {
            // File was TRUNCATED (got smaller)
            self.full_reindex()?;
            Ok(true)
        } else if current_size > self.last_file_size {
            // File GREW (new data appended)
            self.incremental_index()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    fn full_reindex(&mut self) -> std::io::Result<()> {
        self.index.clear();

        let mut file = File::open(&self.file_path)?;
        Self::create_index(&mut file, &mut self.index)?;

        self.last_file_size = std::fs::metadata(&self.file_path)?.len();
        Ok(())
    }

    fn incremental_index(&mut self) -> std::io::Result<()> {
        let mut file = File::open(&self.file_path)?;

        // Start reading from where we left off
        file.seek(SeekFrom::Start(self.last_file_size))?;

        let mut buffer = [0u8; 64 * 1024];
        let mut offset = self.last_file_size;

        // Scan only the NEW bytes
        loop {
            let bytes_read = file.read(&mut buffer)?;
            if bytes_read == 0 {
                break;
            } // EOF

            let chunk = &buffer[..bytes_read];

            // Find newlines in the new data
            for pos in memchr_iter(b'\n', chunk) {
                let absolute_pos = offset + pos as u64;
                self.index.push(absolute_pos); // Add to existing index
            }

            offset += bytes_read as u64;
        }

        // Update tracked size
        self.last_file_size = offset;
        Ok(())
    }
}
