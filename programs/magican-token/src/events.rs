use anchor_lang::prelude::*;

#[event]
pub struct MintInitialized {
    pub mint: Pubkey,
    pub admin: Pubkey,
    pub max_supply: u64,
}

#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub new_supply: u64,
}

#[event]
pub struct TokensBurned {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
}

/// `mint` is carried explicitly so an indexer can tell which token moved
/// without correlating against anything off-chain.
#[event]
pub struct TokensTransferred {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AdminProposed {
    pub current_admin: Pubkey,
    pub pending_admin: Pubkey,
}

#[event]
pub struct AdminChanged {
    pub previous_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct MintAuthorityRevoked {
    pub mint: Pubkey,
    pub final_supply: u64,
}
