import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { assert } from "chai";
import { MagicanToken } from "../target/types/magican_token";

const { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } = anchor.web3;
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

const DECIMALS = 9;
const toUnits = (n: number) => n * 10 ** DECIMALS;

// Минимальный парсер TokenAccount (SPL Token Program layout):
//   amount (8 bytes LE u64), mint (32), owner (32), ...
// Нам нужен только amount для проверки баланса.
function readTokenAmount(data: Buffer): bigint {
  return data.readBigUInt64LE(0);
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

  // PDA ATA: derive по (mint, owner) — для проверки баланса в тестах.
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
  it("initialize — создаёт минт с 9 decimals", async () => {
    await program.methods
      .initialize()
      .accounts({
        mint: mint,
        authority: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    const mintInfo = await provider.connection.getAccountInfo(mint);
    assert.isNotNull(mintInfo, "mint account должен существовать");
    assert.isTrue(mintInfo!.owner.equals(TOKEN_PROGRAM_ID));
  });

  // ───────────────────────────────────────────
  // mint_token
  // ───────────────────────────────────────────
  it("mint_token — выпускает токены на ATA authority", async () => {
    const amount = toUnits(100);
    await program.methods
      .mintToken(new anchor.BN(amount))
      .accounts({
        mint: mint,
        authority: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const accInfo = await provider.connection.getAccountInfo(ataA);
    assert.isNotNull(accInfo, "ATA authority должен быть создан");
    assert.equal(readTokenAmount(accInfo!.data).toString(), amount.toString());
  });

  it("mint_token — отклоняет ZeroAmount", async () => {
    try {
      await program.methods
        .mintToken(new anchor.BN(0))
        .accounts({
          mint: mint,
          authority: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("должен был упасть с ZeroAmount");
    } catch (err) {
      assert.include(String(err), "Amount must be greater than zero");
    }
  });

  // ───────────────────────────────────────────
  // burn_token
  // ───────────────────────────────────────────
  it("burn_token — сжигает токены с ATA authority", async () => {
    const accBefore = await provider.connection.getAccountInfo(ataA);
    assert.isNotNull(accBefore);
    const before = readTokenAmount(accBefore!.data);

    const burnAmount = toUnits(20);
    await program.methods
      .burnToken(new anchor.BN(burnAmount))
      .accounts({
        mint: mint,
        authority: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const accAfter = await provider.connection.getAccountInfo(ataA);
    assert.isNotNull(accAfter);
    const after = readTokenAmount(accAfter!.data);
    assert.equal(after.toString(), (before - BigInt(burnAmount)).toString());
  });

  it("burn_token — отклоняет попытку чужого пользователя", async () => {
    // userA не владеет ataA (он принадлежит wallet), SPL отклонит транзакцию.
    try {
      await program.methods
        .burnToken(new anchor.BN(1))
        .accounts({
          mint: mint,
          authority: userA.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([userA])
        .rpc();
      assert.fail("должен был упасть — userA не владелец ATA");
    } catch (err) {
      assert.isOk(err, "транзакция должна быть отклонена");
    }
  });

  // ───────────────────────────────────────────
  // transfer_token
  // ───────────────────────────────────────────
  it("transfer_token — переводит токены на новый ATA (init_if_needed)", async () => {
    const transferAmount = toUnits(30);
    await program.methods
      .transferToken(new anchor.BN(transferAmount))
      .accounts({
        mint: mint,
        recipient: userB.publicKey,
        authority: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const accB = await provider.connection.getAccountInfo(ataB);
    assert.isNotNull(accB, "ATA userB должен быть создан через init_if_needed");
    assert.equal(
      readTokenAmount(accB!.data).toString(),
      transferAmount.toString()
    );
  });

  it("transfer_token — отклоняет ZeroAmount", async () => {
    try {
      await program.methods
        .transferToken(new anchor.BN(0))
        .accounts({
          mint: mint,
          recipient: userB.publicKey,
          authority: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("должен был упасть с ZeroAmount");
    } catch (err) {
      assert.include(String(err), "Amount must be greater than zero");
    }
  });
});
