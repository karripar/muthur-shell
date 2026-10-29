use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

pub const MAX_FILE: u64 = 64 * 1024;
pub fn permitted(path: &Path, roots: &[String]) -> Result<PathBuf, String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Path unavailable: {e}"))?;
    if !roots.iter().any(|r| {
        Path::new(r)
            .canonicalize()
            .is_ok_and(|root| canonical.starts_with(root))
    }) {
        return Err("ACCESS DENIED. Select an approved directory with FILES GRANT.".into());
    }
    // Credentials and application state must never enter model context through file tools.
    for component in canonical.components() {
        let name = component.as_os_str().to_string_lossy().to_ascii_lowercase();
        if name.starts_with(".env")
            || [
                ".ssh",
                ".aws",
                ".gnupg",
                ".azure",
                ".kube",
                ".git",
                "credentials",
                "id_rsa",
                "id_ed25519",
                "muthur.sqlite",
                "muthur.sqlite-wal",
                "muthur.sqlite-shm",
            ]
            .contains(&name.as_str())
            || name.ends_with(".pem")
            || name.ends_with(".key")
        {
            return Err("ACCESS DENIED. Sensitive credential or application-state path.".into());
        }
    }
    Ok(canonical)
}
pub fn read_text(path: &Path, roots: &[String]) -> Result<String, String> {
    let canonical = permitted(path, roots)?;
    let file = File::open(canonical).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_FILE {
        return Err("Only regular UTF-8 text files up to 64 KiB may be inspected.".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_FILE + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_FILE || bytes.contains(&0) {
        return Err("File is too large or contains binary data".into());
    }
    String::from_utf8(bytes).map_err(|_| "File is not UTF-8 text".into())
}
pub fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new("dev.muthur.terminal", "openai-api-key")
        .map_err(|e| format!("OS credential store unavailable: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn traversal_and_sibling_are_denied() {
        let base = std::env::temp_dir().join(format!("muthur-security-{}", std::process::id()));
        let root = base.join("approved");
        let sibling = base.join("approved-other");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&sibling).unwrap();
        std::fs::write(sibling.join("outside.txt"), "secret").unwrap();
        std::fs::write(root.join(".env"), "secret").unwrap();
        std::fs::write(root.join("safe.txt"), "safe").unwrap();
        let roots = vec![root.to_string_lossy().into_owned()];
        assert!(permitted(&root.join("../approved-other/outside.txt"), &roots).is_err());
        assert!(read_text(&root.join(".env"), &roots).is_err());
        assert_eq!(read_text(&root.join("safe.txt"), &roots).unwrap(), "safe");
        std::fs::remove_dir_all(&base).unwrap();
    }
}
