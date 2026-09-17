use anchor_lang::prelude::*;

/// Seed of the singleton config PDA that governs the token.
pub const CONFIG_SEED: &[u8] = b"config";

/// Seed of the canonical mint PDA.
///
/// Fixed seeds are what make the token a singleton: there is exactly one
/// address this program will ever accept as its own mint, so a look-alike
/// token cannot be created through `initialize`.
pub const MINT_SEED: &[u8] = b"mint";

/// Decimals of the canonical mint.
pub const DECIMALS: u8 = 9;

/// Hard cap on total supply, in base units (10^-9 MAGICAN).
///
/// A constant rather than a stored field: "supply is capped at one billion"
/// is then verifiable by reading this line, instead of by trusting whatever
/// value happened to be written into an account at initialization.
pub const MAX_SUPPLY: u64 = 1_000_000_000 * 10u64.pow(DECIMALS as u32);

/// Governance state for the token.
///
/// Created once by `initialize`. The `init` constraint on this account is what
/// makes a second initialization impossible — the check is structural, not a
/// runtime comparison that could be forgotten.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// May mint tokens and revoke the mint authority.
    pub admin: Pubkey,
    /// Set by `propose_admin`, cleared once the proposed admin accepts.
    ///
    /// Transfer is two-step so that a mistyped address cannot strand the
    /// token: an unaccepted proposal changes nothing.
    pub pending_admin: Option<Pubkey>,
    /// Canonical bump of this config PDA.
    pub bump: u8,
    /// Canonical bump of the mint PDA, stored so every instruction can validate
    /// the mint by derivation instead of re-searching for the bump.
    pub mint_bump: u8,
}
