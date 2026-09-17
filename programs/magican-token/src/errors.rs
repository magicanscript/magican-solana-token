use anchor_lang::prelude::*;

#[error_code]
pub enum MagicanError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Minting this amount would exceed the maximum supply")]
    SupplyCapExceeded,
    #[msg("Signer is not authorized for this instruction")]
    Unauthorized,
    #[msg("No admin transfer is pending")]
    NoPendingAdmin,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
