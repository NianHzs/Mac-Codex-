use codex_plus_core::ads::{fetch_ad_list, local_ad_payload};
use serde_json::json;

#[test]
fn codework_ad_payload_is_empty_and_local() {
    assert_eq!(local_ad_payload(), json!({ "version": 1, "ads": [] }));
}

#[tokio::test]
async fn codework_ad_fetch_never_requires_a_remote_source() {
    let payload = fetch_ad_list().await.expect("local ad payload");
    assert_eq!(payload, json!({ "version": 1, "ads": [] }));
}
