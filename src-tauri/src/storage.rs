use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::Mutex};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Settings {
    pub mode: String,
    pub phosphor: String,
    pub effects: bool,
    pub sound: bool,
    pub speed: u64,
    pub ratio: bool,
    pub model: String,
    pub context_turns: usize,
    pub ai_tools: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            mode: "operator".into(),
            phosphor: "green".into(),
            effects: true,
            sound: false,
            speed: 8,
            ratio: false,
            model: "gpt-4.1-mini".into(),
            context_turns: 8,
            ai_tools: false,
        }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if !["operator", "nostromo"].contains(&self.mode.as_str())
            || !["green", "amber"].contains(&self.phosphor.as_str())
            || self.speed > 30
            || !(1..=20).contains(&self.context_turns)
            || self.model.is_empty()
            || self.model.len() > 100
            || !self
                .model
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-._".contains(&b))
        {
            return Err("Invalid terminal settings".into());
        }
        Ok(())
    }
}
pub struct Store(pub Mutex<Connection>);
impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        let db = Connection::open(path).map_err(|e| e.to_string())?;
        db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, command TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS roots (path TEXT PRIMARY KEY);").map_err(|e|e.to_string())?;
        Ok(Self(Mutex::new(db)))
    }
    pub fn settings(&self) -> Result<Settings, String> {
        let db = self.0.lock().map_err(|_| "Storage lock failed")?;
        let mut stmt = db
            .prepare("SELECT value FROM config WHERE key='settings'")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        match rows.next().map_err(|e| e.to_string())? {
            Some(row) => {
                let s: Settings =
                    serde_json::from_str(&row.get::<_, String>(0).map_err(|e| e.to_string())?)
                        .map_err(|e| e.to_string())?;
                s.validate()?;
                Ok(s)
            }
            None => Ok(Settings::default()),
        }
    }
    pub fn save(&self, settings: &Settings) -> Result<(), String> {
        settings.validate()?;
        self.0
            .lock()
            .map_err(|_| "Storage lock failed")?
            .execute(
                "INSERT OR REPLACE INTO config VALUES ('settings',?1)",
                [serde_json::to_string(settings).map_err(|e| e.to_string())?],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn history(&self) -> Result<Vec<String>, String> {
        let db = self.0.lock().map_err(|_| "Storage lock failed")?;
        let mut stmt = db.prepare("SELECT command FROM (SELECT id,command FROM history ORDER BY id DESC LIMIT 500) ORDER BY id").map_err(|e|e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
    pub fn record(&self, command: &str) -> Result<(), String> {
        if command.len() > 8192 {
            return Err("Command exceeds 8192 bytes".into());
        }
        let db = self.0.lock().map_err(|_| "Storage lock failed")?;
        db.execute("INSERT INTO history(command) VALUES (?1)", params![command])
            .map_err(|e| e.to_string())?;
        db.execute("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 500)", []).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn roots(&self) -> Result<Vec<String>, String> {
        let db = self.0.lock().map_err(|_| "Storage lock failed")?;
        let mut stmt = db
            .prepare("SELECT path FROM roots ORDER BY path")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invalid_settings() {
        let mut s = Settings::default();
        s.context_turns = 0;
        assert!(s.validate().is_err());
    }
    #[test]
    fn persistence_roundtrip_and_bound() {
        let store = Store::open(Path::new(":memory:")).unwrap();
        store.save(&Settings::default()).unwrap();
        assert_eq!(store.settings().unwrap().mode, "operator");
        for i in 0..505 {
            store.record(&format!("HELP {i}")).unwrap();
        }
        let h = store.history().unwrap();
        assert_eq!(h.len(), 500);
        assert_eq!(h[0], "HELP 5");
    }
}
