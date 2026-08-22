fn main() {
    #[cfg(windows)]
    let attrs = {
        let windows = tauri_build::WindowsAttributes::new()
            .app_manifest(include_str!("windows-app-manifest.xml"));
        tauri_build::Attributes::new().windows_attributes(windows)
    };

    #[cfg(not(windows))]
    let attrs = tauri_build::Attributes::new();

    tauri_build::try_build(attrs).expect("failed to run Tauri build script");
}
