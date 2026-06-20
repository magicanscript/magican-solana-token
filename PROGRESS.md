# Progress

## Done

- Anchor 1.0 program compiles cleanly (`anchor build`)
- 7/7 integration tests passing (`anchor test`)
- All Russian comments and test strings translated to English
- README rewritten in English (clean, portfolio-ready)
- Version warnings resolved (`anchor_version = "1.0.2"` in Anchor.toml)

## Next Session

1. **Deploy to devnet** — get a live program address on devnet
   - Run `anchor deploy --provider.cluster devnet`
   - Update README with devnet address + Solana Explorer link

2. **Deploy script** — fill in `migrations/deploy.ts` to initialize the mint after deploy
   - So there's a live token visible on-chain, not just a program

## Notes

- Wallet keypair is at `~/.config/solana/id.json` (copied from original machine)
- Program ID: `BcyHy9xz3kvthmvc2WFQRYGoFfzCAQcpLxVC7d1zPjQD`
- Need devnet SOL for deploy — `solana airdrop 2 --url devnet`
