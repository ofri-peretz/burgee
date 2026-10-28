fn main() {
    // Only the Node binding links against N-API; `cargo test` builds the plain library.
    if std::env::var_os("CARGO_FEATURE_NAPI").is_some() {
        napi_build::setup();
    }
}
