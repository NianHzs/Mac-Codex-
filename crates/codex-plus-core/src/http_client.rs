pub fn proxied_client(user_agent: &str) -> anyhow::Result<reqwest::Client> {
    Ok(client_builder(user_agent).build()?)
}

pub fn client_for_endpoint(user_agent: &str, endpoint: &str) -> anyhow::Result<reqwest::Client> {
    let mut builder = client_builder(user_agent);
    if is_loopback_endpoint(endpoint) {
        builder = builder.no_proxy();
    }
    Ok(builder.build()?)
}

fn client_builder(user_agent: &str) -> reqwest::ClientBuilder {
    let ua = if user_agent.trim().is_empty() {
        format!("CodexPlusPlus/{}", env!("CARGO_PKG_VERSION"))
    } else {
        user_agent.trim().to_string()
    };
    reqwest::Client::builder().user_agent(ua)
}

fn is_loopback_endpoint(endpoint: &str) -> bool {
    let Ok(url) = url::Url::parse(endpoint) else {
        return false;
    };
    match url.host() {
        Some(url::Host::Ipv4(address)) => address.is_loopback(),
        Some(url::Host::Ipv6(address)) => address.is_loopback(),
        Some(url::Host::Domain(domain)) => domain
            .trim_end_matches('.')
            .eq_ignore_ascii_case("localhost"),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::is_loopback_endpoint;

    #[test]
    fn loopback_relay_endpoints_bypass_the_system_proxy() {
        assert!(is_loopback_endpoint("http://127.0.0.1:9335/v1/responses"));
        assert!(is_loopback_endpoint("http://localhost:9335/v1/models"));
        assert!(is_loopback_endpoint("http://[::1]:9335/v1/responses"));
        assert!(is_loopback_endpoint("http://127.0.0.2:9335/v1/responses"));
        assert!(!is_loopback_endpoint("https://relay.example/v1/responses"));
        assert!(!is_loopback_endpoint(
            "http://192.168.1.8:9335/v1/responses"
        ));
    }
}
