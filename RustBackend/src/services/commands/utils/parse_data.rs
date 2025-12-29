use crate::types::Response;

pub fn parse_data(
    regex_pattern: &Option<regex::Regex>,
    nbr_columns: Option<u8>,
    data: &[String],
    start_line: u64,
    show_errors: bool,
) -> Vec<Vec<String>> {
    // If no regex, just wrap each line
    let Some(regex) = regex_pattern else {
        return data.iter().map(|line| vec![line.clone()]).collect();
    };

    // Only track first 6 failed lines (5 to show + 1 to detect "more")
    let mut failed_lines: Vec<u64> = Vec::new();
    let mut total_failures = 0usize;
    let mut results = Vec::new();

    for (i, line) in data.iter().enumerate() {
        if let Some(caps) = regex.captures(line) {
            // Extract capture groups (skip index 0 which is the full match)
            let groups: Vec<String> = caps
                .iter()
                .skip(1)
                .filter_map(|m| m.map(|m| m.as_str().to_string()))
                .collect();

            // Validate column count if user provided one
            let is_valid = if let Some(expected) = nbr_columns {
                groups.len() == expected as usize
            } else {
                true
            };

            if is_valid {
                results.push(groups);
            } else {
                // Column count mismatch - fall back to raw line
                results.push(vec![line.clone()]);
                if failed_lines.len() < 6 {
                    failed_lines.push(start_line + i as u64);
                }
                total_failures += 1;
            }
        } else {
            // Regex didn't match - fall back to raw line
            results.push(vec![line.clone()]);
            if failed_lines.len() < 6 {
                failed_lines.push(start_line + i as u64);
            }
            total_failures += 1;
        }
    }

    // Report failures (show first 5)
    if total_failures > 0 && show_errors {
        let preview: Vec<String> = failed_lines.iter().take(5).map(|n| n.to_string()).collect();
        let suffix = if total_failures > 5 { "..." } else { "" };

        let response = Response::Info {
            message: format!(
                "Failed to parse {} line(s): [{}]{}",
                total_failures,
                preview.join(", "),
                suffix
            ),
        };
        eprintln!("{}", serde_json::to_string(&response).unwrap());
    }

    results
}
