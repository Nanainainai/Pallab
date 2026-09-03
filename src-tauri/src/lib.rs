use base64::Engine;
use bcrypt::{hash, verify, DEFAULT_COST};
use lettre::message::{header::ContentType, Attachment, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use log::{error, info, warn};
use rand::{distributions::Alphanumeric, Rng};
use serde_json::{json, Map, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::path::BaseDirectory;
use tauri_plugin_log::{Target, TargetKind};

/// Unified base path helper (~/Documents/Pallab)
fn get_base_dir() -> PathBuf {
    dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Pallab")
}

/// Resolve data files dynamically under ~/Documents/Pallab/data
fn get_data_path(file_name: &str) -> PathBuf {
    get_base_dir().join("data").join(file_name)
}

/// Resolve database storage folder under ~/Documents/Pallab/database
fn get_database_path() -> PathBuf {
    get_base_dir().join("database")
}

fn get_report_database_path() -> PathBuf {
    get_base_dir().join("database").join("রিপোর্ট")
}

fn get_report_filename(report: &Value) -> String {
    let report_type = sanitize_filename(
        report
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("রিপোর্ট"),
    );

    let date = sanitize_filename(report.get("date").and_then(|v| v.as_str()).unwrap_or(""));

    let reach = sanitize_filename(report.get("reach").and_then(|v| v.as_str()).unwrap_or(""));

    let organization = sanitize_filename(
        report
            .get("organization")
            .and_then(|v| v.as_str())
            .unwrap_or(""),
    );

    let mut name = report_type;

    if !date.is_empty() {
        name.push_str(&format!(" ({})", date));
    }

    if !reach.is_empty() {
        name.push(' ');
        name.push_str(&reach);
    }

    if !organization.is_empty() {
        name.push(' ');
        name.push_str(&organization);
    }

    format!("{}.report", name)
}

#[tauri::command]
fn save_templates_json(data: String) -> Result<(), String> {
    let path = get_data_path("templates.json");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, data).map_err(|e| e.to_string())
}

/// Converts Bengali numerals (০-৯) into English numerals (0-9)
fn to_english_digits(input: &str) -> String {
    input
        .chars()
        .map(|c| match c {
            '০' => '0',
            '১' => '1',
            '২' => '2',
            '৩' => '3',
            '৪' => '4',
            '৫' => '5',
            '৬' => '6',
            '৭' => '7',
            '৮' => '8',
            '৯' => '9',
            _ => c,
        })
        .collect()
}

fn sanitize_filename(s: &str) -> String {
    s.chars()
        .filter(|c| {
            !matches!(
                c,
                '<' | '>' | ':' | '"' | '\'' | '/' | '\\' | '|' | '?' | '*'
            )
        })
        .collect()
}

fn parse_bengali_date(date_str: &str) -> Option<(i32, u32, u32)> {
    let eng_digits = to_english_digits(date_str);
    let parts: Vec<&str> = eng_digits.split('.').collect();
    if parts.len() == 3 {
        let day = parts[0].parse::<u32>().ok()?;
        let month = parts[1].parse::<u32>().ok()?;
        let year = parts[2].parse::<i32>().ok()?;
        Some((year, month, day))
    } else {
        None
    }
}

/// Converts Bengali date into English formatted string ("DD-MM-YYYY")
fn format_english_date(date_str: &str) -> String {
    if let Some((year, month, day)) = parse_bengali_date(date_str) {
        format!("{:02}-{:02}-{}", day, month, year)
    } else {
        to_english_digits(date_str).replace('.', "-")
    }
}

fn calculate_fiscal_year(date_str: &str, is_auxiliary: bool) -> String {
    if let Some((year, month, _)) = parse_bengali_date(date_str) {
        let (fy_start, fy_end) = if is_auxiliary {
            if month >= 11 {
                (year, year + 1)
            } else {
                (year - 1, year)
            }
        } else if month >= 7 {
            (year, year + 1)
        } else {
            (year - 1, year)
        };

        format!("{}-{:02}", fy_start, fy_end % 100)
    } else {
        "2025-26".to_string()
    }
}

/// Reads the top-level `letter-no` field (Bengali digits) and normalizes it to English digits.
fn extract_letter_no(letter: &Value) -> Option<String> {
    letter
        .get("letter-no")
        .and_then(|v| v.as_str())
        .map(to_english_digits)
        .filter(|s| !s.is_empty())
}

/// Picks the first subject's title, used only for building a human-readable filename.
fn first_subject_title(letter: &Value) -> String {
    letter
        .get("subjects")
        .and_then(|s| s.as_array())
        .and_then(|arr| arr.first())
        .and_then(|s| s.get("subject"))
        .and_then(|s| s.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("Letter")
        .to_string()
}

/// Resolves the fiscal-year folder name from `fy-start`/`fy-end`, falling back to computing it
/// from the date + organization if either field is missing.
fn fiscal_year_folder(letter: &Value) -> String {
    let fy_start = letter
        .get("fy-start")
        .and_then(|v| v.as_str())
        .map(to_english_digits)
        .filter(|s| !s.is_empty());
    let fy_end = letter
        .get("fy-end")
        .and_then(|v| v.as_str())
        .map(to_english_digits)
        .filter(|s| !s.is_empty());

    if let (Some(start), Some(end)) = (fy_start, fy_end) {
        return format!("{}-{:0>2}", start, end);
    }

    let date_str = letter.get("date").and_then(|v| v.as_str()).unwrap_or("");
    let org = letter
        .get("sender-department")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let is_auxiliary = matches!(org, "মজলিস খোদ্দামুল আহমদীয়া" | "মজলিস আতফালুল আহমদীয়া");

    calculate_fiscal_year(date_str, is_auxiliary)
}

/// Builds the save-folder for a letter directly from its flat form-value fields —
/// no more amela.json ID lookups since the editor now stores plain strings.
fn get_target_directory(letter: &Value) -> PathBuf {
    let jamaat = sanitize_filename(
        letter
            .get("sender-jamaat")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("নারায়ণগঞ্জ"),
    );
    let org = sanitize_filename(
        letter
            .get("sender-department")
            .and_then(|v| v.as_str())
            .unwrap_or(""),
    );
    let dafter = sanitize_filename(letter.get("dafter").and_then(|v| v.as_str()).unwrap_or(""));
    let fy_str = fiscal_year_folder(letter);

    get_database_path()
        .join(jamaat)
        .join(org)
        .join("পত্র")
        .join("প্রেরিত")
        .join(dafter)
        .join(fy_str)
}

#[tauri::command]
fn get_next_letter_no(jamaat: Option<String>, org: String, dept: String, fy_str: String) -> String {
    let mut max_no: u32 = 0;
    let jamaat_name = jamaat
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "নারায়ণগঞ্জ".to_string());

    let folder = get_database_path()
        .join(sanitize_filename(&jamaat_name))
        .join(sanitize_filename(&org))
        .join("পত্র")
        .join("প্রেরিত")
        .join(sanitize_filename(&dept))
        .join(&fy_str);

    if let Ok(entries) = fs::read_dir(folder) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("letter") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(json) = serde_json::from_str::<Value>(&content) {
                        if let Some(no_str) = extract_letter_no(&json) {
                            if let Ok(num) = no_str.parse::<u32>() {
                                if num > max_no {
                                    max_no = num;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    format!("{:02}", max_no + 1)
}

/// Recursively scans ~/Documents/Pallab/database for all .letter files and returns their JSON content
#[tauri::command]
fn get_all_letters() -> Result<Vec<Value>, String> {
    let db_path = get_database_path();
    let mut letters = Vec::new();

    fn scan_directory(dir: &Path, letters: &mut Vec<Value>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    scan_directory(&path, letters);
                } else if path.extension().and_then(|s| s.to_str()) == Some("letter") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(mut json) = serde_json::from_str::<Value>(&content) {
                            if let Some(object) = json.as_object_mut() {
                                object.insert(
                                    "filepath".to_string(),
                                    Value::String(path.to_string_lossy().to_string()),
                                );
                            }

                            letters.push(json);
                        }
                    }
                }
            }
        }
    }

    if db_path.exists() {
        scan_directory(&db_path, &mut letters);
    }

    Ok(letters)
}

#[tauri::command]
fn save_report(report: Value) -> Result<String, String> {
    let reach = report.get("reach").and_then(Value::as_str).unwrap_or("");

    let jamaat = report.get("jamaat").and_then(Value::as_str).unwrap_or("");

    let organization = report
        .get("organization")
        .and_then(Value::as_str)
        .unwrap_or("");

    let report_type = report.get("type").and_then(Value::as_str).unwrap_or("");

    let month = report.get("month").and_then(Value::as_str).unwrap_or("");

    let date = report.get("date").and_then(Value::as_str).unwrap_or("");

    let fy_start = report.get("fy-start").and_then(Value::as_str).unwrap_or("");

    let fy_end = report.get("fy-end").and_then(Value::as_str).unwrap_or("");

    if jamaat.is_empty()
        || organization.is_empty()
        || report_type.is_empty()
        || month.is_empty()
        || date.is_empty()
        || fy_start.is_empty()
        || fy_end.is_empty()
    {
        return Err("রিপোর্ট সংরক্ষণের জন্য প্রয়োজনীয় তথ্য অসম্পূর্ণ।".to_string());
    }

    let directory = get_base_dir()
        .join("database")
        .join(sanitize_filename(jamaat))
        .join(sanitize_filename(organization))
        .join("রিপোর্ট")
        .join("প্রেরিত")
        .join(sanitize_filename(report_type))
        .join(format!(
            "{}-{}",
            to_english_digits(fy_start),
            to_english_digits(fy_end)
        ));

    fs::create_dir_all(&directory)
        .map_err(|e| format!("রিপোর্টের directory তৈরি করা যায়নি: {}", e))?;

    let file_name = format!(
        "{} ({}) {} {} {} রিপোর্ট.report",
        sanitize_filename(month),
        sanitize_filename(date),
        sanitize_filename(reach),
        sanitize_filename(organization),
        sanitize_filename(report_type)
    );

    let file_path = directory.join(file_name);

    let serialized = serde_json::to_string_pretty(&report)
        .map_err(|e| format!("রিপোর্ট JSON তৈরি করা যায়নি: {}", e))?;

    fs::write(&file_path, serialized).map_err(|e| format!("রিপোর্ট সংরক্ষণ করা যায়নি: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_all_reports() -> Result<Vec<Value>, String> {
    let database_path = get_database_path();
    let mut reports = Vec::new();

    fn scan_directory(dir: &Path, reports: &mut Vec<Value>) {
        let entries = match fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            let path = entry.path();

            if path.is_dir() {
                scan_directory(&path, reports);
                continue;
            }

            if path.extension().and_then(|value| value.to_str()) != Some("report") {
                continue;
            }

            let content = match fs::read_to_string(&path) {
                Ok(content) => content,
                Err(_) => continue,
            };

            let mut report = match serde_json::from_str::<Value>(&content) {
                Ok(report) => report,
                Err(_) => continue,
            };

            if let Some(object) = report.as_object_mut() {
                object.insert(
                    "filepath".to_string(),
                    Value::String(path.to_string_lossy().to_string()),
                );
            }

            reports.push(report);
        }
    }

    if database_path.exists() {
        scan_directory(&database_path, &mut reports);
    }

    Ok(reports)
}

#[tauri::command]
fn delete_report(filepath: String) -> Result<(), String> {
    let path = Path::new(&filepath);
    let database_path = get_database_path();

    if !path.starts_with(&database_path) {
        return Err("Refusing to delete a file outside the reports database".to_string());
    }

    if path.extension().and_then(|value| value.to_str()) != Some("report") {
        return Err("Refusing to delete a non-.report file".to_string());
    }

    fs::remove_file(path).map_err(|e| format!("Failed to delete report {:?}: {}", path, e))
}

#[tauri::command]
fn save_letter(form_values: Value) -> Result<String, String> {
    let folder = get_target_directory(&form_values);

    fs::create_dir_all(&folder)
        .map_err(|e| format!("Failed to create folder {:?}: {}", folder, e))?;

    let target_no = extract_letter_no(&form_values);

    // If a `.letter` file with the same letter number already exists in this folder,
    // overwrite it with the new editor state instead of creating a duplicate.
    let mut existing_path: Option<PathBuf> = None;

    if let (Some(target), Ok(entries)) = (&target_no, fs::read_dir(&folder)) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("letter") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(existing_json) = serde_json::from_str::<Value>(&content) {
                        if extract_letter_no(&existing_json).as_ref() == Some(target) {
                            existing_path = Some(path);
                            break;
                        }
                    }
                }
            }
        }
    }

    let path = match existing_path {
        Some(path) => path,
        None => {
            let no_str = target_no.unwrap_or_else(|| "01".to_string());
            let subject_title = sanitize_filename(&first_subject_title(&form_values));
            let date_str = form_values
                .get("date")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let eng_date = format_english_date(date_str);

            let filename = if eng_date.is_empty() {
                format!("{} '{}'.letter", no_str, subject_title)
            } else {
                format!("{} ({}) '{}'.letter", no_str, eng_date, subject_title)
            };

            folder.join(filename)
        }
    };

    let json_str = serde_json::to_string_pretty(&form_values).map_err(|e| e.to_string())?;
    fs::write(&path, json_str).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_letter(filepath: String) -> Result<(), String> {
    let path = Path::new(&filepath);
    let db_path = get_database_path();

    if !path.starts_with(&db_path) {
        return Err("Refusing to delete a file outside the letters database".to_string());
    }

    if path.extension().and_then(|s| s.to_str()) != Some("letter") {
        return Err("Refusing to delete a non-.letter file".to_string());
    }

    fs::remove_file(path).map_err(|e| format!("Failed to delete {:?}: {}", path, e))
}

#[tauri::command]
async fn send_email_with_pdf(
    from_email: String,
    to_email: String,
    app_password: String,
    subject: String,
    pdf_base64: String,
) -> Result<(), String> {
    let clean_base64 = pdf_base64.split(',').last().unwrap_or(&pdf_base64);

    let pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(clean_base64)
        .map_err(|e| format!("Failed to decode PDF base64: {}", e))?;

    let attachment = Attachment::new(String::from("letter.pdf")).body(
        pdf_bytes,
        ContentType::parse("application/pdf").map_err(|e| e.to_string())?,
    );

    let email = Message::builder()
        .from(
            from_email
                .parse()
                .map_err(|e: lettre::address::AddressError| e.to_string())?,
        )
        .to(to_email
            .parse()
            .map_err(|e: lettre::address::AddressError| e.to_string())?)
        .subject(subject)
        .multipart(
            MultiPart::mixed()
                .singlepart(SinglePart::plain(String::from(
                    "Please find attached letter.",
                )))
                .singlepart(attachment),
        )
        .map_err(|e| e.to_string())?;

    let creds = Credentials::new(from_email.clone(), app_password);

    let mailer = SmtpTransport::relay("smtp.gmail.com")
        .map_err(|e| e.to_string())?
        .credentials(creds)
        .build();

    mailer
        .send(&email)
        .map_err(|e| format!("Failed to send email: {}", e))?;

    Ok(())
}

#[tauri::command]
fn save_pdf_to_temp(pdf_base64: String, file_name: String) -> Result<String, String> {
    let clean_base64 = pdf_base64.split(',').last().unwrap_or(&pdf_base64);

    let pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(clean_base64)
        .map_err(|e| format!("Failed to decode PDF base64: {}", e))?;

    // PDFs are stored separately from reports.
    // Final directory:
    // Pallab/database/tempPdf/
    let dir = get_base_dir().join("tempPdf");

    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create tempPdf folder {:?}: {}", dir, e))?;

    // The frontend may pass either:
    //   "মাস ... রিপোর্ট"
    // or:
    //   "মাস ... রিপোর্ট.report"
    //
    // Strip only the .report extension so the PDF has the
    // exact same basename as the corresponding .report file.
    let base_name = file_name.strip_suffix(".report").unwrap_or(&file_name);

    let safe_name = sanitize_filename(base_name);

    let path = dir.join(format!("{}.pdf", safe_name));

    fs::write(&path, pdf_bytes).map_err(|e| format!("Failed to write PDF {:?}: {}", path, e))?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn print_pdf_silent(pdf_base64: String, printer_name: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return Ok(());
    }

    #[cfg(not(target_os = "android"))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            let clean_base64 = pdf_base64.split(',').last().unwrap_or(&pdf_base64);

            let pdf_bytes = base64::engine::general_purpose::STANDARD
                .decode(clean_base64)
                .map_err(|e| format!("Failed to decode PDF base64: {}", e))?;

            let temp_dir = std::env::temp_dir();
            let file_path = temp_dir.join("print_job.pdf");
            fs::write(&file_path, pdf_bytes).map_err(|e| e.to_string())?;

            #[cfg(target_os = "windows")]
            {
                let exe_dir = std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|p| p.to_path_buf()));

                let prod_path = exe_dir.as_ref().map(|d| d.join("PDFtoPrinter.exe"));

                let dev_path = std::env::current_dir().ok().map(|d| {
                    if d.ends_with("src-tauri") {
                        d.join("binaries").join("PDFtoPrinter.exe")
                    } else {
                        d.join("src-tauri")
                            .join("binaries")
                            .join("PDFtoPrinter.exe")
                    }
                });

                let pdftoprinter_path = match (prod_path, dev_path) {
                    (Some(p), _) if p.exists() => p,
                    (_, Some(d)) if d.exists() => d,
                    _ => PathBuf::from("PDFtoPrinter.exe"),
                };

                let mut cmd = Command::new(pdftoprinter_path);
                cmd.arg(&file_path);
                if let Some(printer) = printer_name {
                    cmd.arg(printer);
                }
                cmd.status().map_err(|e| format!("Print failed: {}", e))?;
            }

            #[cfg(not(target_os = "windows"))]
            {
                let mut cmd = Command::new("lp");
                if let Some(printer) = printer_name {
                    cmd.arg("-d").arg(printer);
                }
                cmd.arg(&file_path);
                cmd.status().map_err(|e| format!("Print failed: {}", e))?;
            }

            Ok(())
        })
        .await
        .map_err(|e| e.to_string())?
    }
}

#[tauri::command]
fn save_amela(amela_data: serde_json::Value) -> Result<Value, String> {
    let path = get_data_path("amela.json");

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json_string = serde_json::to_string_pretty(&amela_data).map_err(|e| e.to_string())?;

    fs::write(path, json_string).map_err(|e| e.to_string())?;

    let new_credentials = sync_hashes_from_amela()?;

    Ok(new_credentials)
}

#[tauri::command]
fn authenticate_user(
    account_type: String,
    reach_no: String,
    jamaat_no: String,
    department_no: String,
    title_no: String,
    input_password: String,
) -> Result<bool, String> {
    let hashes_path = get_data_path("hashes.json");
    let content = fs::read_to_string(hashes_path)
        .map_err(|e| format!("Could not read credentials file: {}", e))?;

    let hashes: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid JSON structure in hashes.json: {}", e))?;

    let stored_hash = match account_type.as_str() {
        "dev" => hashes.get("dev").and_then(|v| v.as_str()),

        "admin" => hashes
            .get(&reach_no)
            .and_then(|r| r.get(&jamaat_no))
            .and_then(|j| j.get(&department_no))
            .and_then(|d| d.get("admin"))
            .and_then(|a| a.as_str()),

        "amela" => hashes
            .get(&reach_no)
            .and_then(|r| r.get(&jamaat_no))
            .and_then(|j| j.get(&department_no))
            .and_then(|d| d.get(&title_no))
            .and_then(|t| t.as_str()),

        _ => return Err("Invalid account type specified.".to_string()),
    };

    let Some(hash_str) = stored_hash else {
        return Ok(false);
    };

    if hash_str == input_password {
        Ok(true)
    } else {
        Ok(verify(input_password, hash_str).unwrap_or(false))
    }
}

fn generate_random_password() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(10)
        .map(char::from)
        .collect()
}

#[tauri::command]
fn save_jamaat(jamaat_data: Value) -> Result<(), String> {
    let path = get_data_path("jamaat.json");

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(
        path,
        serde_json::to_string_pretty(&jamaat_data).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn sync_hashes_from_amela() -> Result<Value, String> {
    let amela_path = get_data_path("amela.json");
    let hashes_path = get_data_path("hashes.json");

    if let Some(parent) = hashes_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let amela_content =
        fs::read_to_string(&amela_path).map_err(|e| format!("Failed to read amela.json: {}", e))?;
    let amela: Value = serde_json::from_str(&amela_content)
        .map_err(|e| format!("Invalid JSON format in amela.json: {}", e))?;

    let mut hashes: Value = if hashes_path.exists() {
        let content = fs::read_to_string(&hashes_path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    let hashes_obj = hashes
        .as_object_mut()
        .ok_or_else(|| "hashes.json root must be an object".to_string())?;

    if !hashes_obj.contains_key("dev") {
        let dev_pass = generate_random_password();
        let dev_hash = hash(&dev_pass, DEFAULT_COST).map_err(|e| e.to_string())?;
        hashes_obj.insert("dev".to_string(), Value::String(dev_hash));
    }

    let mut created_passwords = Map::new();

    let mut get_or_create_hash =
        |path: &str, node: &mut Map<String, Value>, key: &str| -> Result<(), String> {
            if !node.contains_key(key) {
                let pass = generate_random_password();
                let hash_str = hash(&pass, DEFAULT_COST).map_err(|e| e.to_string())?;
                node.insert(key.to_string(), Value::String(hash_str));
                created_passwords.insert(format!("{}/{}", path, key), Value::String(pass));
            }
            Ok(())
        };

    if let Some(root_map) = amela.as_object() {
        for (reach_name, reach_val) in root_map {
            let reach_node = hashes_obj
                .entry(reach_name)
                .or_insert_with(|| json!({}))
                .as_object_mut()
                .unwrap();

            if let Some(jamaat_map) = reach_val.as_object() {
                for (jamaat_name, jamaat_val) in jamaat_map {
                    let jamaat_node = reach_node
                        .entry(jamaat_name)
                        .or_insert_with(|| json!({}))
                        .as_object_mut()
                        .unwrap();

                    if let Some(org_map) = jamaat_val.as_object() {
                        for (org_name, org_val) in org_map {
                            let org_node = jamaat_node
                                .entry(org_name)
                                .or_insert_with(|| json!({}))
                                .as_object_mut()
                                .unwrap();

                            let existing = org_node.clone();
                            org_node.clear();

                            let path_prefix =
                                format!("{}/{}/{}", reach_name, jamaat_name, org_name);

                            if let Some(admin) = existing.get("admin") {
                                org_node.insert("admin".to_string(), admin.clone());
                            } else {
                                get_or_create_hash(&path_prefix, org_node, "admin")?;
                            }

                            if let Some(dept_map) = org_val.as_object() {
                                for (_dept_name, title_val) in dept_map {
                                    if let Some(titles_map) = title_val.as_object() {
                                        for (title_name, _) in titles_map {
                                            if let Some(existing_hash) = existing.get(title_name) {
                                                org_node.insert(
                                                    title_name.clone(),
                                                    existing_hash.clone(),
                                                );
                                            } else {
                                                get_or_create_hash(
                                                    &path_prefix,
                                                    org_node,
                                                    title_name,
                                                )?;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let json_output = serde_json::to_string_pretty(&hashes).map_err(|e| e.to_string())?;
    fs::write(&hashes_path, json_output).map_err(|e| e.to_string())?;

    Ok(Value::Object(created_passwords))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            save_letter,
            save_report,
            get_all_letters,
            send_email_with_pdf,
            print_pdf_silent,
            save_amela,
            sync_hashes_from_amela,
            authenticate_user,
            get_next_letter_no,
            save_templates_json,
            save_pdf_to_temp,
            get_all_reports,
            delete_report,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .targets([
                            Target::new(TargetKind::Stdout),
                            Target::new(TargetKind::LogDir { file_name: None }),
                        ])
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
