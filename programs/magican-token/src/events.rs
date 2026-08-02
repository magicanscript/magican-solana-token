use anchor_lang::prelude::*;

#[event]
pub struct MintInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TokensBurned {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TokensTransferred {
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}
