import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { assert } from "chai";
import { MagicanToken } from "../target/types/magican_token";

const { PublicKey, Keypair } = anchor.web3;
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

const DECIMALS = 9;
const toUnits = (n: number) => n * 10 ** DECIMALS;

// SPL TokenAccount layout: mint (32 bytes), owner (32 bytes), amount (8 bytes u64 LE) at offset 64.
function readTokenAmount(data: Buffer): bigint {
  return data.readBigUInt64LE(64);
}

describe("magican-token", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MagicanToken as Program<MagicanToken>;
  const wallet = provider.wallet as anchor.Wallet;

  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  const userA = Keypair.generate();
  const userB = Keypair.generate();

  // Derive ATAs locally to verify balances without fetching via the program client.
  const ataA = PublicKey.findProgramAddressSync(
    [wallet.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
  const ataB = PublicKey.findProgramAddressSync(
    [userB.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];

  before(async () => {
    const sigA = await provider.connection.requestAirdrop(
      userA.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sigA);

    const sigB = await provider.connection.requestAirdrop(
      userB.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sigB);
  });

  // ───────────────────────────────────────────
  // initialize
  // ───────────────────────────────────────────
  it("initialize — creates mint with 9 decimals", async () => {
    await program.methods
      .initialize()
      .accounts({
        mint: mint,
        authority: wallet.publicKey,
      })
      .signers([mintKeypair])
      .rpc();

    const mintInfo = await provider.connection.getAccountInfo(mint);
    assert.isNotNull(mintInfo, "mint account should exist");
    assert.isTrue(mintInfo!.owner.equals(TOKEN_PROGRAM_ID));
  });

  // ───────────────────────────────────────────
  // mint_token
  // ───────────────────────────────────────────
  it("mint_token — mints tokens to authority ATA", async () => {
    const amount = toUnits(100);
    await program.methods
      .mintToken(new anchor.BN(amount))
      .accounts({
        mint: mint,
        authority: wallet.publicKey,
      })
      .rpc();

    const accInfo = await provider.connection.getAccountInfo(ataA);
    assert.isNotNull(accInfo, "authority ATA should be created");
    assert.equal(readTokenAmount(accInfo!.data).toString(), amount.toString());
  });

  it("mint_token — rejects zero amount", async () => {
    try {
      await program.methods
        .mintToken(new anchor.BN(0))
        .accounts({
          mint: mint,
          authority: wallet.publicKey,
        })
        .rpc();
      assert.fail("should have thrown ZeroAmount");
    } catch (err) {
      assert.include(String(err), "Amount must be greater than zero");
    }
  });

  // ───────────────────────────────────────────
  // burn_token
  // ───────────────────────────────────────────
  it("burn_token — burns tokens from authority ATA", async () => {
    const accBefore = await provider.connection.getAccountInfo(ataA);
    assert.isNotNull(accBefore);
    const before = readTokenAmount(accBefore!.data);

    const burnAmount = toUnits(20);
    await program.methods
      .burnToken(new anchor.BN(burnAmount))
      .accounts({
        mint: mint,
        authority: wallet.publicKey,
      })
      .rpc();

    const accAfter = await provider.connection.getAccountInfo(ataA);
    assert.isNotNull(accAfter);
    const after = readTokenAmount(accAfter!.data);
    assert.equal(after.toString(), (before - BigInt(burnAmount)).toString());
  });

  it("burn_token — rejects unauthorized user", async () => {
    // userA does not own ataA (it belongs to wallet), so SPL will reject the tx.
    try {
      await program.methods
        .burnToken(new anchor.BN(1))
        .accounts({
          mint: mint,
          authority: userA.publicKey,
        })
        .signers([userA])
        .rpc();
      assert.fail("should have thrown — userA does not own the ATA");
    } catch (err) {
      assert.isOk(err, "transaction should be rejected");
    }
  });

  // ───────────────────────────────────────────
  // transfer_token
  // ───────────────────────────────────────────
  it("transfer_token — transfers to new ATA via init_if_needed", async () => {
    const transferAmount = toUnits(30);
    await program.methods
      .transferToken(new anchor.BN(transferAmount))
      .accounts({
        mint: mint,
        recipient: userB.publicKey,
        authority: wallet.publicKey,
      })
      .rpc();

    const accB = await provider.connection.getAccountInfo(ataB);
    assert.isNotNull(accB, "userB ATA should be created via init_if_needed");
    assert.equal(
      readTokenAmount(accB!.data).toString(),
      transferAmount.toString()
    );
  });

  it("transfer_token — rejects zero amount", async () => {
    try {
      await program.methods
        .transferToken(new anchor.BN(0))
        .accounts({
          mint: mint,
          recipient: userB.publicKey,
          authority: wallet.publicKey,
        })
        .rpc();
      assert.fail("should have thrown ZeroAmount");
    } catch (err) {
      assert.include(String(err), "Amount must be greater than zero");
    }
  });
});
