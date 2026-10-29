mod ai;
mod security;
mod storage;
mod tools;
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use storage::{Settings, Store};
use tauri::{Manager, State};

pub struct AppState {
    store: Store,
    conversation: Mutex<Vec<Vec<Value>>>,
    query_lock: tokio::sync::Mutex<()>,
    cancel: AtomicBool,
}
#[tauri::command]
fn bootstrap(state: State<AppState>) -> Result<Value, String> {
    let configured = security::credential()
        .and_then(|e| e.get_password().map_err(|e| e.to_string()))
        .is_ok();
    Ok(
        json!({"settings":state.store.settings()?,"history":state.store.history()?,"roots":state.store.roots()?,"credential_configured":configured}),
    )
}
#[tauri::command]
async fn run_tool(name: String, args: Value, state: State<'_, AppState>) -> Result<Value, String> {
    tools::execute(&name, args, state.store.roots()?).await
}
#[tauri::command]
fn save_settings(settings: Settings, state: State<AppState>) -> Result<(), String> {
    let _guard = state
        .query_lock
        .try_lock()
        .map_err(|_| "Cancel the active query before changing settings")?;
    let previous = state.store.settings()?;
    if previous.ai_tools != settings.ai_tools
        || previous.mode != settings.mode
        || previous.model != settings.model
    {
        state
            .conversation
            .lock()
            .map_err(|_| "Conversation lock failed")?
            .clear();
    }
    state.store.save(&settings)
}
#[tauri::command]
fn record_history(command: String, state: State<AppState>) -> Result<(), String> {
    state.store.record(&command)
}
#[tauri::command]
fn clear_history(state: State<AppState>) -> Result<(), String> {
    state
        .store
        .0
        .lock()
        .map_err(|_| "Storage lock failed")?
        .execute("DELETE FROM history", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
async fn choose_directory(state: State<'_, AppState>) -> Result<Value, String> {
    let handle = rfd::AsyncFileDialog::new()
        .set_title("Approve a directory for read-only inspection")
        .pick_folder()
        .await;
    if let Some(handle) = handle {
        let path = handle.path().canonicalize().map_err(|e| e.to_string())?;
        let path = path.to_str().ok_or("Path is not Unicode")?;
        state
            .store
            .0
            .lock()
            .map_err(|_| "Storage lock failed")?
            .execute("INSERT OR IGNORE INTO roots VALUES (?1)", [path])
            .map_err(|e| e.to_string())?;
    }
    Ok(json!(state.store.roots()?))
}
#[tauri::command]
fn revoke_directory(path: String, state: State<AppState>) -> Result<(), String> {
    let _guard = state
        .query_lock
        .try_lock()
        .map_err(|_| "Cancel the active query before revoking access")?;
    state
        .conversation
        .lock()
        .map_err(|_| "Conversation lock failed")?
        .clear();
    state
        .store
        .0
        .lock()
        .map_err(|_| "Storage lock failed")?
        .execute("DELETE FROM roots WHERE path=?1", [path])
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
async fn set_credential(state: State<'_, AppState>) -> Result<bool, String> {
    use std::io::Read;
    let _guard = state
        .query_lock
        .try_lock()
        .map_err(|_| "Cancel the active query before changing credentials")?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("Import OpenAI key from a UTF-8 text file (not copied to history)")
        .pick_file()
        .await;
    let Some(file) = file else { return Ok(false) };
    let metadata = std::fs::metadata(file.path()).map_err(|_| "Cannot inspect credential file")?;
    if !metadata.is_file() || metadata.len() > 512 {
        return Err("Credential file must contain only an API key (maximum 512 bytes)".into());
    }
    let mut key = String::new();
    std::fs::File::open(file.path())
        .map_err(|_| "Cannot open credential file")?
        .take(513)
        .read_to_string(&mut key)
        .map_err(|_| "Cannot read UTF-8 credential file")?;
    let key = key.trim();
    if !key.starts_with("sk-")
        || key.len() < 20
        || key.len() > 512
        || key.chars().any(char::is_whitespace)
    {
        return Err("Invalid API key format".into());
    }
    security::credential()?
        .set_password(key)
        .map_err(|e| format!("Cannot save to OS credential store: {e}"))?;
    state
        .conversation
        .lock()
        .map_err(|_| "Conversation lock failed")?
        .clear();
    Ok(true)
}
#[tauri::command]
fn delete_credential(state: State<AppState>) -> Result<(), String> {
    let _guard = state
        .query_lock
        .try_lock()
        .map_err(|_| "Cancel the active query before deleting credentials")?;
    security::credential()?
        .delete_credential()
        .map_err(|e| e.to_string())?;
    state
        .conversation
        .lock()
        .map_err(|_| "Conversation lock failed")?
        .clear();
    Ok(())
}
#[tauri::command]
fn cancel_query(state: State<AppState>) {
    state.cancel.store(true, Ordering::SeqCst);
}
#[tauri::command]
fn reset_conversation(state: State<AppState>) -> Result<(), String> {
    let _guard = state
        .query_lock
        .try_lock()
        .map_err(|_| "Cancel the active query first")?;
    state
        .conversation
        .lock()
        .map_err(|_| "Conversation lock failed")?
        .clear();
    Ok(())
}
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let store = Store::open(&dir.join("muthur.sqlite")).map_err(std::io::Error::other)?;
            app.manage(AppState {
                store,
                conversation: Mutex::new(Vec::new()),
                query_lock: tokio::sync::Mutex::new(()),
                cancel: AtomicBool::new(false),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            run_tool,
            save_settings,
            record_history,
            clear_history,
            choose_directory,
            revoke_directory,
            set_credential,
            delete_credential,
            ai::query,
            cancel_query,
            reset_conversation
        ])
        .run(tauri::generate_context!())
        .expect("MU/TH/UR runtime failed");
}
