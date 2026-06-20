use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

pub mod errors;
pub mod events;

use crate::errors::MagicanError;
use crate::events::{MintInitialized, TokensBurned, TokensMinted, TokensTransferred};

declare_id!("BcyHy9xz3kvthmvc2WFQRYGoFfzCAQcpLxVC7d1zPjQD");

#[program]
pub mod magican_token {
    use super::*;

    /// Создаёт минт — "фабрику" токена
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        emit!(MintInitialized {
            mint: ctx.accounts.mint.key(),
            authority: ctx.accounts.authority.key(),
        });

        msg!("Magican Token mint initialized!");
        msg!("Mint address: {}", ctx.accounts.mint.key());
        Ok(())
    }

    /// Выпускает токены на указанный аккаунт
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

    /// Сжигает токены с аккаунта
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

    /// Переводит токены между аккаунтами
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
// Аккаунты
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

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = recipient,
    )]
    pub to_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    /// CHECK: получатель — просто адрес, не подписывает
    pub recipient: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
