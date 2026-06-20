# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A portfolio Solana token program built with Anchor 1.0. The on-chain program implements four instructions: `initialize`, `mint_token`, `burn_token`, `transfer_token`. All instructions use the classic SPL Token program (not Token-2022).

Program ID: `BcyHy9xz3kvthmvc2WFQRYGoFfzCAQcpLxVC7d1zPjQD`

## Commands

```bash
# Build the Anchor program
anchor build

# Run all tests (requires localnet running)
anchor test

# Run tests without rebuilding
anchor test --skip-build

# Start local validator manually
solana-test-validator

# Lint / format TypeScript
yarn lint
yarn lint:fix
```

Rust toolchain is pinned to **1.89.0** via `rust-toolchain.toml`.
Anchor version: **1.0.2** (`@anchor-lang/core` on JS side, `anchor-lang` on Rust side).
Tests use mocha 11.7.0 with `ts-node/register` — config is in `.mocharc.json`.

## Architecture

### On-chain program (`programs/magican-token/src/`)

- `lib.rs` — program entrypoint; all four instructions and their `#[derive(Accounts)]` structs
- `errors.rs` — `MagicanError::ZeroAmount` (the only custom error)
- `events.rs` — four Anchor events emitted by each instruction (`MintInitialized`, `TokensMinted`, `TokensBurned`, `TokensTransferred`)

All token operations are thin wrappers around SPL Token CPI calls (`token::mint_to`, `token::burn`, `token::transfer`). `MintToken` and `TransferToken` use `init_if_needed` to create ATAs automatically. `BurnToken` does not use `init_if_needed` (the ATA must already exist).

### Tests (`tests/magican-token.ts`)

Seven integration tests against localnet. The test file imports from `@anchor-lang/core` (Anchor 1.0 package name). It reads raw token account data via `readBigUInt64LE(0)` to check balances, because the generated client's `tokenAccount` field does not expose a high-level `amount` directly.

## Known Issue

The TypeScript test at line 70 passes `tokenProgram` in the accounts object for `initialize`, but the generated IDL/`ResolvedAccounts` type for Anchor 1.0 may not include `tokenProgram` as an explicit account in that instruction. After `anchor build`, check `target/types/magican_token.ts` — if `tokenProgram` is absent from the `Initialize` accounts type, remove it from the `.accounts({...})` call in the test.
