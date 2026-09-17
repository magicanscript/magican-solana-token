use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::MagicanError;
use crate::state::{Config, CONFIG_SEED, DECIMALS, MINT_SEED};

/// Creates the config and the canonical mint.
///
/// `init` on `config` is the whole access-control story for this instruction:
/// the second caller fails at account validation, before the handler runs.
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        seeds = [MINT_SEED],
        bump,
        mint::decimals = DECIMALS,
        mint::authority = config.key(),
    )]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Mints new tokens to the admin's associated token account.
///
/// Only the program can sign for the mint authority, so this instruction is the
/// only path to new supply.
#[derive(Accounts)]
pub struct MintToken<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ MagicanError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [MINT_SEED],
        bump = config.mint_bump,
    )]
    pub mint: Account<'info, Mint>,

    // Created automatically if the admin has no ATA for this mint yet.
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = mint,
        associated_token::authority = admin,
    )]
    pub token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Burns tokens from the signer's own associated token account.
///
/// Open to any holder — the seeds on `mint` are what keep this instruction from
/// operating on a foreign SPL token.
#[derive(Accounts)]
pub struct BurnToken<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [MINT_SEED],
        bump = config.mint_bump,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = owner,
    )]
    pub token_account: Account<'info, TokenAccount>,

    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

/// Transfers tokens from the signer's ATA to the recipient's ATA.
#[derive(Accounts)]
pub struct TransferToken<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(seeds = [MINT_SEED], bump = config.mint_bump)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = owner,
    )]
    pub from_account: Account<'info, TokenAccount>,

    // Created automatically if the recipient has no ATA for this mint yet.
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = recipient,
    )]
    pub to_account: Account<'info, TokenAccount>,

    /// CHECK: recipient only seeds the ATA derivation; it is never read or written.
    pub recipient: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Nominates a new admin. Takes effect only once that address accepts.
#[derive(Accounts)]
pub struct ProposeAdmin<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ MagicanError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    pub admin: Signer<'info>,
}

/// Completes an admin transfer. Must be signed by the nominated address.
#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.pending_admin.is_some() @ MagicanError::NoPendingAdmin,
        constraint = config.pending_admin == Some(new_admin.key()) @ MagicanError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    pub new_admin: Signer<'info>,
}

/// Permanently gives up the mint authority, freezing total supply.
#[derive(Accounts)]
pub struct RevokeMintAuthority<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ MagicanError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [MINT_SEED],
        bump = config.mint_bump,
    )]
    pub mint: Account<'info, Mint>,

    pub admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
}
