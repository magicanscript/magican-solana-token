# magican-token

A Solana SPL token program built with Anchor 1.0.

The token is a singleton by construction: both the governance config and the mint
are PDAs derived from fixed seeds, so there is exactly one address the program will
ever treat as its own token, and `initialize` can only ever succeed once. Supply is
capped in code and the mint authority can be given up permanently.

Deployed on **Solana devnet**: `EaQA46S3p1opE1Q4oNTh7xpresSTvuNDa9NSJMbXj5YB` — [View on Solana Explorer](https://explorer.solana.com/address/EaQA46S3p1opE1Q4oNTh7xpresSTvuNDa9NSJMbXj5YB?cluster=devnet)

> The deployed bytecode predates the redesign described below. The address is
> upgradeable and the code here is the current source of truth.


## Instructions

| Instruction | Access | Description |
|-------------|--------|-------------|
| `initialize` | once, ever | Creates the config and the canonical mint (9 decimals) |
| `mint_token` | admin | Mints to the admin's ATA, up to `MAX_SUPPLY` |
| `burn_token` | any holder | Burns from the signer's own ATA |
| `transfer_token` | any holder | Transfers to a recipient's ATA (creates it if needed) |
| `propose_admin` | admin | Nominates a new admin |
| `accept_admin` | nominee | Completes the transfer — two-step, so a typo cannot strand the token |
| `revoke_mint_authority` | admin | Permanently freezes supply. Irreversible |

Both PDAs use fixed seeds: `config` from `[b"config"]`, `mint` from `[b"mint"]`.
`MAX_SUPPLY` is a constant in `state.rs`, not stored state, so the cap is verifiable
by reading one line.

## Requirements

- Rust (via `rustup`) — pinned to `1.89.0` in `rust-toolchain.toml`
- Solana CLI `3.1.10` (provides `solana-test-validator`)
- Anchor CLI `1.0.2` (via `avm install 1.0.2 && avm use 1.0.2`)
- Node.js 18+ and yarn
- A local keypair at `~/.config/solana/id.json` — `Anchor.toml` points the provider
  wallet there, and the Mocha suite reads it through `AnchorProvider.env()`.
  Create one with `solana-keygen new`; on localnet it needs no funding.

## Getting Started

```bash
# Install JS dependencies
yarn install

# Build the program and its IDL
yarn build

# Run tests against a local validator
yarn test:local
```

`Anchor.toml` sets `cluster = "localnet"`, so tests never touch a public RPC.

### Why the extra flags

The keypair matching the declared program ID lives in `target/`, which is gitignored,
so a fresh clone never has it. Two consequences:

- `anchor build` aborts on a program-ID mismatch; `--ignore-keys` keeps the ID in
  `declare_id!` authoritative instead of rewriting it.
- `anchor test` would deploy to the wrong address. `scripts/test-localnet.sh` starts
  the validator with `--bpf-program`, installing the built `.so` at its declared ID
  without needing that keypair, then runs the suite with `--skip-deploy`.
  (Anchor 1.0 dropped the `[[test.genesis]]` config that used to do this.)

Restoring `target/deploy/magican_token-keypair.json` from a backup makes both flags
unnecessary.

### Deploying

The devnet program is upgradeable and its upgrade authority is the provider wallet,
so upgrades need only `id.json` — not the program keypair:

```bash
anchor upgrade target/deploy/magican_token.so \
  --program-id EaQA46S3p1opE1Q4oNTh7xpresSTvuNDa9NSJMbXj5YB \
  --provider.cluster devnet
```

## Test Results

18 passing. Alongside the happy paths, each negative test pins down a property the
program is supposed to guarantee:

```
✔ initialize — rejects a second initialization
✔ mint_token — rejects a non-admin signer
✔ mint_token — rejects minting past MAX_SUPPLY
✔ transfer_token — rejects a foreign mint
✔ accept_admin — rejects acceptance with no pending proposal
✔ accept_admin — rejects acceptance by anyone but the nominee
✔ mint_token — the previous admin can no longer mint
✔ mint_token — fails after the authority is revoked
```

## Stack

- [Anchor 1.0](https://www.anchor-lang.com/) — Solana program framework
- [anchor-spl](https://docs.rs/anchor-spl) — SPL Token CPI helpers
- Mocha + Chai — integration tests
