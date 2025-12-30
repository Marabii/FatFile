use once_cell::sync::Lazy;
use regex::Regex;

use crate::types::LogFormat;

// Compile all regex patterns once at startup using once_cell

static CEF_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^CEF:(\d+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|(\d+)\|(.*)$").unwrap()
});

static W3C_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2})\s(\S+)\s(\S+)\s(\S+)").unwrap()
});

static SYSLOG_5424_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^<(\d{1,3})>1\s(\S+)\s(\S+)\s(\S+)\s(\S+)\s(\S+)\s(\[(?:.+)\]|-) (.*)$").unwrap()
});

static NCSA_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"^(\d{1,3}(?:\.\d{1,3}){3}) - - \[(.*?)\] "(.*?)" (\d{3}) (\d+|-)"#).unwrap()
});

static CLF_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"^(\S+) \S+ (\S+) \[([\w:/]+\s[+\-]\d{4})\] "(\S+) (\S+)\s*(\S+)?\s*" (\d{3}) (\S+)"#,
    )
    .unwrap()
});

static SYSLOG_3164_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"^<(\d{1,3})>([A-Z][a-z]{2}\s{1,2}\d{1,2}\s\d{2}:\d{2}:\d{2})\s(\S+)\s([^:]+):\s(.*)$",
    )
    .unwrap()
});

/// Get the compiled regex pattern for a specific log format
/// Returns None for LogFormat::Other
/// Returns a cloned Regex (cheap operation, uses Arc internally)
pub fn get_pattern(format: &LogFormat) -> Option<Regex> {
    match format {
        LogFormat::CommonEventFormat => Some(CEF_PATTERN.clone()),
        LogFormat::W3CExtended => Some(W3C_PATTERN.clone()),
        LogFormat::SyslogRFC5424 => Some(SYSLOG_5424_PATTERN.clone()),
        LogFormat::NCSACombined => Some(NCSA_PATTERN.clone()),
        LogFormat::CommonLogFormat => Some(CLF_PATTERN.clone()),
        LogFormat::SyslogRFC3164 => Some(SYSLOG_3164_PATTERN.clone()),
        LogFormat::Other => None,
    }
}

/// Get the number of columns (capture groups) for a specific log format
/// Returns None for LogFormat::Other
pub fn get_column_count(format: &LogFormat) -> Option<u8> {
    match format {
        LogFormat::CommonEventFormat => Some(8),  // version, vendor, product, device_version, signature_id, name, severity, extension
        LogFormat::W3CExtended => Some(5),         // date, time, field1, field2, field3
        LogFormat::SyslogRFC5424 => Some(8),       // priority, timestamp, hostname, app-name, procid, msgid, structured-data, message
        LogFormat::NCSACombined => Some(5),        // IP, timestamp, request, status, size
        LogFormat::CommonLogFormat => Some(8),     // host, ident, timestamp, method, path, protocol, status, bytes
        LogFormat::SyslogRFC3164 => Some(5),       // priority, timestamp, hostname, tag, message
        LogFormat::Other => None,
    }
}

/// Detect the log format from a line by trying patterns in order of specificity
/// Returns LogFormat::Other if no pattern matches
pub fn detect_format(line: &str) -> LogFormat {
    // Try patterns in order of specificity (most specific first)

    // 1. Common Event Format (CEF) - very specific prefix
    if CEF_PATTERN.is_match(line) {
        return LogFormat::CommonEventFormat;
    }

    // 2. W3C Extended Log File Format (IIS) - specific date-time format
    if W3C_PATTERN.is_match(line) {
        return LogFormat::W3CExtended;
    }

    // 3. Syslog RFC 5424 - has version "1" after priority
    if SYSLOG_5424_PATTERN.is_match(line) {
        return LogFormat::SyslogRFC5424;
    }

    // 4. NCSA Combined Log Format - includes HTTP method and has quotes
    if NCSA_PATTERN.is_match(line) {
        return LogFormat::NCSACombined;
    }

    // 5. Common Log Format (CLF) - basic web server log
    if CLF_PATTERN.is_match(line) {
        return LogFormat::CommonLogFormat;
    }

    // 6. Syslog RFC 3164 - BSD style syslog
    if SYSLOG_3164_PATTERN.is_match(line) {
        return LogFormat::SyslogRFC3164;
    }

    // No match found
    LogFormat::Other
}
