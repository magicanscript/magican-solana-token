use anchor_lang::prelude::*;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{self, Burn, MintTo, SetAuthority, TransferChecked};

pub mod contexts;
pub mod errors;
pub mod events;
pub mod state;

use crate::contexts::*;
use crate::errors::MagicanError;
use crate::events::{
    AdminChanged, AdminProposed, MintAuthorityRevoked, MintInitialized, TokensBurned, TokensMinted,
    TokensTransferred,
};
use crate::state::{CONFIG_SEED, DECIMALS, MAX_SUPPLY};

declare_id!("EaQA46S3p1opE1Q4oNTh7xpresSTvuNDa9NSJMbXj5YB");

#[program]
pub mod magican_token {
    use super::*;

    /// Creates the config and the canonical mint. Can only ever succeed once.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.pending_admin = None;
        config.bump = ctx.bumps.config;
        config.mint_bump = ctx.bumps.mint;

        emit!(MintInitialized {
            mint: ctx.accounts.mint.key(),
            admin: config.admin,
            max_supply: MAX_SUPPLY,
        });

        msg!("Magican Token initialized, max supply {}", MAX_SUPPLY);
        Ok(())
    }

    /// Mints tokens to the admin's associated token account.
    pub fn mint_token(ctx: Context<MintToken>, amount: u64) -> Result<()> {
        require!(amount > 0, MagicanError::ZeroAmount);

        // Computed before the CPI: after it, the cached `supply` is stale.
        let new_supply = ctx
            .accounts
            .mint
            .supply
            .checked_add(amount)
            .ok_or(MagicanError::MathOverflow)?;
        require!(new_supply <= MAX_SUPPLY, MagicanError::SupplyCapExceeded);

        let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[ctx.accounts.config.bump]]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        );
        token::mint_to(cpi_ctx, amount)?;

        emit!(TokensMinted {
            mint: ctx.accounts.mint.key(),
            to: ctx.accounts.token_account.key(),
            amount,
            new_supply,
        });

        msg!("Minted {}, supply now {}", amount, new_supply);
        Ok(())
    }

    /// Burns tokens from the signer's own associated token account.
    pub fn burn_token(ctx: Context<BurnToken>, amount: u64) -> Result<()> {
        require!(amount > 0, MagicanError::ZeroAmount);

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.key(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        token::burn(cpi_ctx, amount)?;

        emit!(TokensBurned {
            mint: ctx.accounts.mint.key(),
            from: ctx.accounts.token_account.key(),
            amount,
        });

        msg!("Burned {}", amount);
        Ok(())
    }

    /// Transfers tokens to the recipient's associated token account.
    pub fn transfer_token(ctx: Context<TransferToken>, amount: u64) -> Result<()> {
        require!(amount > 0, MagicanError::ZeroAmount);

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.from_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        token::transfer_checked(cpi_ctx, amount, DECIMALS)?;

        emit!(TokensTransferred {
            mint: ctx.accounts.mint.key(),
            from: ctx.accounts.from_account.key(),
            to: ctx.accounts.to_account.key(),
            amount,
        });

        msg!("Transferred {}", amount);
        Ok(())
    }

    /// Nominates a new admin. Nothing changes until the nominee accepts.
    pub fn propose_admin(ctx: Context<ProposeAdmin>, new_admin: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.pending_admin = Some(new_admin);

        emit!(AdminProposed {
            current_admin: config.admin,
            pending_admin: new_admin,
        });

        msg!("Admin transfer proposed to {}", new_admin);
        Ok(())
    }

    /// Completes an admin transfer proposed earlier.
    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let previous_admin = config.admin;

        config.admin = ctx.accounts.new_admin.key();
        config.pending_admin = None;

        emit!(AdminChanged {
            previous_admin,
            new_admin: config.admin,
        });

        msg!("Admin changed to {}", config.admin);
        Ok(())
    }

    /// Permanently revokes the mint authority, freezing total supply.
    ///
    /// One-way: once the SPL mint authority is `None`, nothing — including a
    /// program upgrade — can restore it.
    pub fn revoke_mint_authority(ctx: Context<RevokeMintAuthority>) -> Result<()> {
        let final_supply = ctx.accounts.mint.supply;

        let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[ctx.accounts.config.bump]]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            SetAuthority {
                current_authority: ctx.accounts.config.to_account_info(),
                account_or_mint: ctx.accounts.mint.to_account_info(),
            },
            signer_seeds,
        );
        token::set_authority(cpi_ctx, AuthorityType::MintTokens, None)?;

        emit!(MintAuthorityRevoked {
            mint: ctx.accounts.mint.key(),
            final_supply,
        });

        msg!("Mint authority revoked, supply frozen at {}", final_supply);
        Ok(())
    }
}
