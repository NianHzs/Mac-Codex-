pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const PRODUCT_LABEL: &str = "Codework AI客户端";
pub const DISPLAY_VERSION: &str = VERSION;

#[cfg(test)]
mod tests {
    use super::{DISPLAY_VERSION, VERSION};

    #[test]
    fn exposes_workspace_version() {
        assert_eq!(VERSION, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn exposes_codework_release_display_version() {
        assert_eq!(DISPLAY_VERSION, VERSION);
    }
}
