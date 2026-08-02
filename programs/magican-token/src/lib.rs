use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

pub mod errors;
pub mod events;

use crate::errors::MagicanError;
use crate::events::{MintInitialized, TokensBurned, TokensMinted, TokensTransferred};

declare_id!("EaQA46S3p1opE1Q4oNTh7xpresSTvuNDa9NSJMbXj5YB");

#[program]
pub mod magican_token {
    use super::*;

    /// Creates the mint account — the token factory.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        emit!(MintInitialized {
            mint: ctx.accounts.mint.key(),
            authority: ctx.accounts.authority.key(),
        });

        msg!("Magican Token mint initialized!");
        msg!("Mint address: {}", ctx.accounts.mint.key());
        Ok(())
    }

    /// Mints tokens to the authority's associated token account.
    pub fn mint_token(ctx: Context<MintToken>, amount: u64) -> Result<()> {
        require!(amount > 0, MagicanError::ZeroAmount);

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.key(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        );
        token::mint_to(cpi_ctx, amount)?;

        emit!(TokensMinted {
            mint: ctx.accounts.mint.key(),
            to: ctx.accounts.token_account.key(),
            amount,
        });

        msg!(
            "Minted {} tokens to {}",
            amount,
            ctx.accounts.token_account.key()
        );
        Ok(())
    }

    /// Burns tokens from the authority's associated token account.
    pub fn burn_token(ctx: Context<BurnToken>, amount: u64) -> Result<()> {
        require!(amount > 0, MagicanError::ZeroAmount);

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.key(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        );
        token::burn(cpi_ctx, amount)?;

        emit!(TokensBurned {
            mint: ctx.accounts.mint.key(),
            from: ctx.accounts.token_account.key(),
            amount,
        });

        msg!("Burned {} tokens", amount);
        Ok(())
    }

    /// Transfers tokens from the authority's ATA to the recipient's ATA.
    pub fn transfer_token(ctx: Context<TransferToken>, amount: u64) -> Result<()> {
        require!(amount > 0, MagicanError::ZeroAmount);

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.from_account.to_account_info(),
                to: ctx.accounts.to_account.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, amount)?;

        emit!(TokensTransferred {
            from: ctx.accounts.from_account.key(),
            to: ctx.accounts.to_account.key(),
            amount,
        });

        msg!("Transferred {} tokens", amount);
        Ok(())
    }
}

// ───────────────────────────────────────────
// Account contexts
// ───────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        mint::decimals = 9,
        mint::authority = authority.key(),
    )]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintToken<'info> {
    #[account(
        mut,
        mint::authority = authority.key(),
    )]
    pub mint: Account<'info, Mint>,

    // Created automatically if it does not exist yet.
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = authority,
    )]
    pub token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BurnToken<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = authority,
    )]
    pub token_account: Account<'info, TokenAccount>,

    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct TransferToken<'info> {
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = authority,
    )]
    pub from_account: Account<'info, TokenAccount>,

    // Created automatically if the recipient has no ATA for this mint yet.
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = recipient,
    )]
    pub to_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    /// CHECK: recipient is a plain address, not required to sign.
    pub recipient: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
