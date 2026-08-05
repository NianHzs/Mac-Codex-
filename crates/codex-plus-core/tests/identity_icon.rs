use codex_plus_core::identity_icon::{
    icon_name_for_role, materialized_icon_file_name_for_role, role_from_materialized_icon_file_name,
};
use codex_plus_core::{windows_descendant_process_ids, windows_identity_icon_class_slots};

#[test]
fn role_specific_window_icon_names_are_stable() {
    assert_eq!(icon_name_for_role("founder"), "identity-founder.ico");
    assert_eq!(icon_name_for_role("director"), "identity-director.ico");
    assert_eq!(icon_name_for_role("administrator"), "identity-administrator.ico");
    assert_eq!(icon_name_for_role("unexpected"), "identity-supreme.ico");
}

#[test]
fn each_identity_role_uses_a_distinct_window_icon_path_to_bypass_windows_icon_cache() {
    assert_eq!(
        materialized_icon_file_name_for_role("administrator"),
        "codework-identity-administrator.ico"
    );
    assert_eq!(
        materialized_icon_file_name_for_role("director"),
        "codework-identity-director.ico"
    );
    assert_eq!(
        materialized_icon_file_name_for_role("founder"),
        "codework-identity-founder.ico"
    );
    assert_eq!(
        materialized_icon_file_name_for_role("vip"),
        "codework-identity-vip.ico"
    );
    assert_eq!(
        materialized_icon_file_name_for_role("supreme"),
        "codework-identity-supreme.ico"
    );
}

#[test]
fn window_icon_updates_include_descendant_processes_of_the_activation_host() {
    assert_eq!(
        windows_descendant_process_ids(10, &[(10, 1), (11, 10), (12, 11), (13, 99)]),
        vec![10, 11, 12],
    );
}

#[test]
fn identity_icon_updates_also_replace_the_electron_window_class_icons() {
    assert_eq!(windows_identity_icon_class_slots(), [-14, -34]);
}

#[test]
fn active_identity_pointer_file_names_round_trip_to_supported_roles() {
    for (file_name, role) in [
        ("codework-identity-administrator.ico", "administrator"),
        ("codework-identity-founder.ico", "founder"),
        ("codework-identity-director.ico", "director"),
        ("codework-identity-supreme.ico", "supreme"),
        ("codework-identity-vip.ico", "vip"),
    ] {
        assert_eq!(role_from_materialized_icon_file_name(file_name), Some(role));
    }
    assert_eq!(role_from_materialized_icon_file_name("unknown.ico"), None);
}
