#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Stdio};
use std::time::Duration;
use std::sync::Mutex;
use tauri::State;

struct CliState {
    processes: Mutex<HashMap<String, Child>>,
}

#[tauri::command]
async fn start_cli(session_id: String, state: State<'_, CliState>) -> Result<String, String> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();
    
    let cli_path = exe_dir.join("dist").join("cli.exe");
    let fallback = exe_dir.parent().unwrap_or(&exe_dir).join("dist").join("cli.exe");
    
    let cli_exe = if cli_path.exists() {
        cli_path
    } else if fallback.exists() {
        fallback
    } else {
        return Err("CLI not found - dist/cli.exe must exist".to_string());
    };
    
    let mut cmd = std::process::Command::new(&cli_exe);
    cmd.arg("--gui");
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.current_dir(std::env::current_dir().unwrap_or_default());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    
    // Wait for session_start event
    let stdout = child.stdout.as_mut().unwrap();
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    
    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if line.contains("\"type\":\"session_start\"") {
            break;
        }
        if line.contains("\"type\":\"error\"") {
            return Err(format!("CLI error: {}", line));
        }
        line.clear();
    }

    state.processes.lock().unwrap().insert(session_id.clone(), child);
    Ok(format!("CLI started: {}", session_id))
}

#[tauri::command]
async fn send_cli_command(
    session_id: String,
    command: String,
    state: State<'_, CliState>,
) -> Result<(), String> {
    let mut processes = state.processes.lock().unwrap();
    let child = processes.get_mut(&session_id).ok_or("Session not found")?;
    
    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(format!("{}\n", command).as_bytes()).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
async fn read_cli_events(
    session_id: String,
    max_events: usize,
    state: State<'_, CliState>,
) -> Result<Vec<String>, String> {
    let mut processes = state.processes.lock().unwrap();
    let child = processes.get_mut(&session_id).ok_or("Session not found")?;
    
    let mut events = Vec::new();
    let stdout = child.stdout.as_mut().unwrap();
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    
    for _ in 0..max_events {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                if line.contains("\"type\"") {
                    events.push(line.trim().to_string());
                }
            }
        }
    }
    
    Ok(events)
}

#[tauri::command]
async fn stop_cli(session_id: String, state: State<'_, CliState>) -> Result<(), String> {
    let mut processes = state.processes.lock().unwrap();
    let child = processes.remove(&session_id);
    drop(processes);

    if let Some(mut c) = child {
        shutdown_child(&mut c)?;
    }

    Ok(())
}

fn shutdown_child(child: &mut Child) -> Result<(), String> {
    if let Some(mut stdin) = child.stdin.take() {
        stdin.flush().map_err(|e| e.to_string())?;
        drop(stdin);
    }

    for _ in 0..10 {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(_) => return Ok(()),
            None => std::thread::sleep(Duration::from_millis(100)),
        }
    }

    child.kill().map_err(|e| e.to_string())?;
    child.wait().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_cli_status(state: State<'_, CliState>) -> Result<Vec<String>, String> {
    let processes = state.processes.lock().unwrap();
    Ok(processes.keys().cloned().collect())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(CliState {
            processes: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            start_cli,
            send_cli_command,
            read_cli_events,
            stop_cli,
            get_cli_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
