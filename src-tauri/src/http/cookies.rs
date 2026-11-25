use std::net::IpAddr;

use chrono::Utc;
use cookie::{Cookie, Expiration, SameSite};
use url::Url;

use crate::models::{CookieRecord, ParsedResponseCookie};

fn is_ip_host(host: &str) -> bool {
    host.parse::<IpAddr>().is_ok()
}

fn domain_matches_host(cookie_domain: &str, request_host: &str, host_only: bool) -> bool {
    let cd = cookie_domain.trim_start_matches('.').to_ascii_lowercase();
    let rh = request_host.to_ascii_lowercase();
    if cd == rh {
        return true;
    }
    if host_only || is_ip_host(&rh) {
        return false;
    }
    rh.ends_with(&format!(".{cd}"))
}

fn default_cookie_path(request_path: &str) -> String {
    if !request_path.starts_with('/') || request_path == "/" {
        return "/".to_string();
    }
    match request_path.rfind('/') {
        Some(0) | None => "/".to_string(),
        Some(idx) => request_path[..idx].to_string(),
    }
}

fn path_matches(request_path: &str, cookie_path: &str) -> bool {
    if request_path == cookie_path {
        return true;
    }
    if request_path.starts_with(cookie_path) {
        if cookie_path.ends_with('/') {
            return true;
        }
        return request_path.as_bytes().get(cookie_path.len()) == Some(&b'/');
    }
    false
}

pub fn parse_set_cookie_header(
    header_value: &str,
    request_url: &Url,
    now_epoch: i64,
) -> Option<(CookieRecord, ParsedResponseCookie)> {
    let parsed = Cookie::parse(header_value).ok()?;
    let request_host = request_url.host_str()?.to_ascii_lowercase();

    let (domain, host_only) = match parsed.domain() {
        Some(raw_domain) => {
            let trimmed = raw_domain.trim().trim_start_matches('.').to_ascii_lowercase();
            if trimmed.is_empty() || !domain_matches_host(&trimmed, &request_host, false) {
                return None;
            }
            (trimmed, false)
        }
        None => (request_host, true),
    };

    let path = match parsed.path() {
        Some(p) if p.starts_with('/') => p.to_string(),
        _ => default_cookie_path(request_url.path()),
    };

    let max_age_secs = parsed.max_age().map(|d| d.whole_seconds());
    let expires_text = parsed.expires().and_then(|exp| match exp {
        Expiration::DateTime(dt) => Some(dt.to_string()),
        Expiration::Session => None,
    });

    // RFC 6265: Max-Age takes precedence over Expires
    let expires_at = if let Some(ma) = max_age_secs {
        if ma <= 0 {
            Some(0)
        } else {
            Some(now_epoch.saturating_add(ma))
        }
    } else if let Some(Expiration::DateTime(dt)) = parsed.expires() {
        Some(dt.unix_timestamp())
    } else {
        None
    };

    let same_site = parsed.same_site().map(|s| match s {
        SameSite::Strict => "Strict".to_string(),
        SameSite::Lax => "Lax".to_string(),
        SameSite::None => "None".to_string(),
    });

    let secure = parsed.secure().unwrap_or(false);
    let http_only = parsed.http_only().unwrap_or(false);

    let record = CookieRecord {
        id: String::new(),
        domain,
        path: path.clone(),
        name: parsed.name().to_string(),
        value: parsed.value().to_string(),
        expires_at,
        secure,
        http_only,
        same_site: same_site.clone(),
        host_only,
        updated_at: Utc::now().to_rfc3339(),
    };

    let ui_cookie = ParsedResponseCookie {
        name: parsed.name().to_string(),
        value: parsed.value().to_string(),
        domain: parsed.domain().map(|d| d.to_string()),
        path: Some(path),
        expires: expires_text,
        max_age: max_age_secs,
        secure,
        http_only,
        same_site,
    };

    Some((record, ui_cookie))
}

pub fn match_cookies_for_url<'a>(
    cookies: &'a [CookieRecord],
    target_url: &Url,
    now_epoch: i64,
) -> Vec<&'a CookieRecord> {
    let Some(host) = target_url.host_str() else {
        return Vec::new();
    };
    let is_https = target_url.scheme().eq_ignore_ascii_case("https");
    let req_path = if target_url.path().is_empty() {
        "/"
    } else {
        target_url.path()
    };

    let mut matched: Vec<&CookieRecord> = cookies
        .iter()
        .filter(|c| {
            if let Some(exp) = c.expires_at {
                if exp <= now_epoch {
                    return false;
                }
            }
            if c.secure && !is_https {
                return false;
            }
            domain_matches_host(&c.domain, host, c.host_only) && path_matches(req_path, &c.path)
        })
        .collect();

    matched.sort_by(|a, b| {
        b.path
            .len()
            .cmp(&a.path.len())
            .then_with(|| a.updated_at.cmp(&b.updated_at))
    });
    matched
}

pub fn build_cookie_header(
    matched: &[&CookieRecord],
    existing_manual_cookie: Option<&str>,
) -> Option<String> {
    let mut manual_names = std::collections::HashSet::new();
    let mut parts: Vec<String> = Vec::new();

    if let Some(raw) = existing_manual_cookie {
        for pair in raw.split(';') {
            let trimmed = pair.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Some((name, _)) = trimmed.split_once('=') {
                manual_names.insert(name.trim().to_string());
            }
            parts.push(trimmed.to_string());
        }
    }

    for c in matched {
        if !manual_names.contains(&c.name) {
            parts.push(format!("{}={}", c.name, c.value));
        }
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join("; "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_cookie(domain: &str, path: &str, name: &str, host_only: bool) -> CookieRecord {
        CookieRecord {
            id: "1".into(),
            domain: domain.into(),
            path: path.into(),
            name: name.into(),
            value: "val".into(),
            expires_at: None,
            secure: false,
            http_only: false,
            same_site: None,
            host_only,
            updated_at: "2026-11-25T00:00:00Z".into(),
        }
    }

    #[test]
    fn parses_set_cookie_defaults_and_max_age_precedence() {
        let url = Url::parse("https://api.example.com/v1/auth/login").unwrap();
        let (rec, ui) = parse_set_cookie_header(
            "sid=xyz; Path=/v1; Max-Age=60; Expires=Wed, 21 Oct 2015 07:28:00 GMT; HttpOnly; Secure; SameSite=Lax",
            &url,
            1_000,
        )
        .unwrap();
        assert_eq!(rec.domain, "api.example.com");
        assert!(rec.host_only);
        assert_eq!(rec.path, "/v1");
        assert_eq!(rec.expires_at, Some(1_060));
        assert!(rec.secure);
        assert!(rec.http_only);
        assert_eq!(rec.same_site.as_deref(), Some("Lax"));
        assert_eq!(ui.name, "sid");
    }

    #[test]
    fn rejects_mismatched_domain_attribute() {
        let url = Url::parse("https://api.example.com/").unwrap();
        assert!(parse_set_cookie_header("x=1; Domain=evil.com", &url, 100).is_none());
        let valid = parse_set_cookie_header("x=1; Domain=.example.com", &url, 100).unwrap();
        assert_eq!(valid.0.domain, "example.com");
        assert!(!valid.0.host_only);
    }

    #[test]
    fn matches_host_only_subdomains_paths_and_secure() {
        let mut secure_cookie = sample_cookie("example.com", "/api", "sec", false);
        secure_cookie.secure = true;
        let host_only = sample_cookie("api.example.com", "/", "ho", true);
        let root_domain = sample_cookie("example.com", "/api/v1", "v1", false);
        let expired = CookieRecord {
            expires_at: Some(500),
            ..sample_cookie("example.com", "/", "old", false)
        };

        let jar = vec![secure_cookie, host_only, root_domain, expired];

        // HTTPS matches secure, host_only, and longer path first
        let https_url = Url::parse("https://api.example.com/api/v1/users").unwrap();
        let m_https = match_cookies_for_url(&jar, &https_url, 1_000);
        let names: Vec<&str> = m_https.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, vec!["v1", "sec", "ho"]);

        // HTTP skips secure cookie; subdomain does not match host_only api.example.com
        let sub_http = Url::parse("http://sub.example.com/api/v1").unwrap();
        let m_http = match_cookies_for_url(&jar, &sub_http, 1_000);
        assert_eq!(m_http.len(), 1);
        assert_eq!(m_http[0].name, "v1");
    }

    #[test]
    fn merges_jar_with_manual_cookie_header_preserving_manual_override() {
        let c1 = sample_cookie("example.com", "/", "sid", true);
        let c2 = sample_cookie("example.com", "/", "theme", true);
        let matched = vec![&c1, &c2];
        let merged = build_cookie_header(&matched, Some("sid=manual_override; foo=bar")).unwrap();
        assert_eq!(merged, "sid=manual_override; foo=bar; theme=val");
    }
}
