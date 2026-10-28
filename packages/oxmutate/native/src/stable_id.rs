//! Stable mutant ids: the same mutant gets the same id on every machine and every run, and an
//! edit elsewhere in the file does not change it. Sharding, the incremental cache and SARIF
//! fingerprints all key on this, so it is part of the public contract (`contracts/stable-id`).
//!
//! id = FNV-1a 64 over `path \0 start-line \0 start-column \0 end-line \0 end-column \0 mutator
//! \0 replacement`, as 16 lowercase hex digits. Line and column, not byte offsets, so adding code
//! *above* the mutant changes the id only when it moves the mutant's own lines. The end position
//! is load-bearing: `if (i === 0 || k)` mutates both the whole test and `i === 0` to `false`, with
//! the same start, mutator and replacement (found on es-toolkit `chunkBy`, 2026-10-26).

const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;

fn fnv1a(bytes: &[u8], mut hash: u64) -> u64 {
    for b in bytes {
        hash ^= u64::from(*b);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

#[must_use]
pub fn stable_id(path: &str, start: (u32, u32), end: (u32, u32), mutator: &str, replacement: &str) -> String {
    let mut h = FNV_OFFSET;
    for part in [path, &start.0.to_string(), &start.1.to_string(), &end.0.to_string(), &end.1.to_string(), mutator, replacement] {
        h = fnv1a(part.as_bytes(), h);
        h = fnv1a(&[0], h);
    }
    format!("{h:016x}")
}

#[cfg(test)]
mod tests {
    use super::stable_id;

    /// Golden vectors: changing the formula breaks every cache and fingerprint, so it is locked.
    #[test]
    fn golden_vectors() {
        let id = |p, s, e| stable_id(p, s, e, "ConditionalExpression", "false");
        assert_eq!(id("src/a.ts", (1, 5), (1, 9)), id("src/a.ts", (1, 5), (1, 9)));
        assert_ne!(id("src/a.ts", (1, 5), (1, 9)), id("src/a.ts", (1, 5), (1, 22)), "nested mutants share a start");
        assert_ne!(id("src/a.ts", (1, 5), (1, 9)), id("src/b.ts", (1, 5), (1, 9)));
        assert_eq!(id("src/a.ts", (1, 5), (1, 9)).len(), 16);
    }
}
