# magican-token

A Solana SPL token program built with Anchor 1.0. Implements four on-chain instructions: initialize, mint, burn, and transfer.

program-id EaQA46S3p1opE1Q4oNTh7xpresSTvuNDa9NSJMbXj5YB

## Instructions

| Instruction | Description |
|-------------|-------------|
| `initialize` | Creates the mint account with 9 decimals |
| `mint_token` | Mints tokens to the authority's ATA (creates it if needed) |
| `burn_token` | Burns tokens from the authority's ATA |
| `transfer_token` | Transfers tokens to a recipient's ATA (creates it if needed) |

## Requirements

- Rust (via `rustup`) — pinned to `1.89.0` in `rust-toolchain.toml`
- Solana CLI with `solana-test-validator`
- Anchor CLI `1.0.2`
- Node.js 18+ and yarn

## Getting Started

```bash
# Install JS dependencies
yarn install

# Build the program
anchor build

# Run tests against localnet (starts validator automatically)
anchor test
```

## Test Results

```
7 passing
  ✔ initialize — creates mint with 9 decimals
  ✔ mint_token — mints tokens to authority ATA
  ✔ mint_token — rejects zero amount
  ✔ burn_token — burns tokens from authority ATA
  ✔ burn_token — rejects unauthorized user
  ✔ transfer_token — transfers to new ATA via init_if_needed
  ✔ transfer_token — rejects zero amount
```

## Stack

- [Anchor 1.0](https://www.anchor-lang.com/) — Solana program framework
- [anchor-spl](https://docs.rs/anchor-spl) — SPL Token CPI helpers
- Mocha + Chai — integration tests
