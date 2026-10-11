use serde::Serialize;
use thiserror::Error;
/// A load failure shown in the error state: plain-language reason plus the raw tool message.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LoadFailure {
    pub title: String,
    pub reason: String,
    pub detail: String,
    pub path: String,
    pub size: Option<u64>,
}
#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum AppError {
    #[error("{}", .0.title)]
    Load(LoadFailure),
    #[error("This file is no longer loaded")]
    StaleLoad,
    #[error("Media decoding failed: {0}")]
    Decode(String),
    #[error("Invalid destination: {0}")]
    Destination(String),
    #[error("An export is already running")]
    ExportBusy,
    #[error("Export cancelled")]
    Cancelled,
    #[error("Export failed: {0}")]
    Export(String),
    #[error("Internal error: {0}")]
    Internal(String),
}
impl From<std::io::Error> for AppError {
    fn from(v: std::io::Error) -> Self {
        Self::Internal(v.to_string())
    }
}
