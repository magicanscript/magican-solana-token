use anchor_lang::prelude::*;

#[error_code]
pub enum MagicanError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
}
