fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "bootstrap",
            "run_tool",
            "save_settings",
            "record_history",
            "clear_history",
            "choose_directory",
            "revoke_directory",
            "set_credential",
            "delete_credential",
            "query",
            "cancel_query",
            "reset_conversation",
        ]),
    ))
    .expect("Tauri build configuration failed");
}
