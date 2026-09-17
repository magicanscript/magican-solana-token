import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { assert } from "chai";
import { MagicanToken } from "../target/types/magican_token";

const { PublicKey, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL } =
  anchor.web3;

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

const DECIMALS = 9;
const MAX_SUPPLY = BigInt(1_000_000_000) * BigInt(10) ** BigInt(DECIMALS);
const toUnits = (n: number) =>
  new anchor.BN(n).mul(new anchor.BN(10 ** DECIMALS));

// SPL TokenAccount layout: mint (32), owner (32), amount (u64 LE) at offset 64.
const readTokenAmount = (data: Buffer): bigint => data.readBigUInt64LE(64);
// SPL Mint layout: mint_authority COption (36), supply (u64 LE) at offset 36.
const readMintSupply = (data: Buffer): bigint => data.readBigUInt64LE(36);
// mint_authority COption tag occupies the first 4 bytes; 0 means None.
const readMintAuthorityIsNone = (data: Buffer): boolean =>
  data.readUInt32LE(0) === 0;

const ata = (owner: anchor.web3.PublicKey, mint: anchor.web3.PublicKey) =>
  PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];

describe("magican-token", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MagicanToken as Program<MagicanToken>;
  const wallet = provider.wallet as anchor.Wallet;

  // Both PDAs are derived from fixed seeds — there is exactly one of each.
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );
  const [mint] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint")],
    program.programId
  );

  const adminAta = ata(wallet.publicKey, mint);

  const stranger = Keypair.generate();
  const recipient = Keypair.generate();
  const nextAdmin = Keypair.generate();

  const fund = async (pubkey: anchor.web3.PublicKey) => {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      5 * LAMPORTS_PER_SOL
    );
    const bh = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({ signature: sig, ...bh });
  };

  before(async () => {
    await fund(stranger.publicKey);
    await fund(nextAdmin.publicKey);
  });

  // ── initialize ───────────────────────────────────────────────

  it("initialize — creates the config and the canonical mint", async () => {
    await program.methods
      .initialize()
      .accounts({ admin: wallet.publicKey })
      .rpc();

    const cfg = await program.account.config.fetch(config);
    assert.strictEqual(cfg.admin.toBase58(), wallet.publicKey.toBase58());
    assert.isNull(cfg.pendingAdmin);

    const mintInfo = await provider.connection.getAccountInfo(mint);
    assert.isNotNull(mintInfo);
    assert.strictEqual(mintInfo!.data[44], DECIMALS);
    assert.strictEqual(readMintSupply(mintInfo!.data), BigInt(0));
  });

  // H-1: the audit's high finding was that anyone could stand up a look-alike
  // token through this program. Fixed seeds plus `init` make that impossible.
  it("initialize — rejects a second initialization (H-1)", async () => {
    try {
      await program.methods
        .initialize()
        .accounts({ admin: stranger.publicKey })
        .signers([stranger])
        .rpc();
      assert.fail("a second initialize should not succeed");
    } catch (err) {
      assert.match(String(err), /already in use|custom program error/i);
    }
  });

  // ── mint_token ───────────────────────────────────────────────

  it("mint_token — mints to the admin ATA", async () => {
    await program.methods
      .mintToken(toUnits(1000))
      .accounts({ admin: wallet.publicKey })
      .rpc();

    const acc = await provider.connection.getAccountInfo(adminAta);
    assert.strictEqual(
      readTokenAmount(acc!.data),
      BigInt(1000) * BigInt(10) ** BigInt(DECIMALS)
    );
  });

  it("mint_token — rejects zero amount", async () => {
    try {
      await program.methods
        .mintToken(new anchor.BN(0))
        .accounts({ admin: wallet.publicKey })
        .rpc();
      assert.fail("zero amount should be rejected");
    } catch (err) {
      assert.include(String(err), "Amount must be greater than zero");
    }
  });

  // Access control: minting is the one thing only the program can authorize,
  // and within the program only the admin may trigger it.
  it("mint_token — rejects a non-admin signer", async () => {
    try {
      await program.methods
        .mintToken(toUnits(1))
        .accounts({ admin: stranger.publicKey })
        .signers([stranger])
        .rpc();
      assert.fail("a non-admin should not be able to mint");
    } catch (err) {
      assert.include(String(err), "Signer is not authorized");
    }
  });

  // M-1: supply was previously unbounded.
  it("mint_token — rejects minting past MAX_SUPPLY (M-1)", async () => {
    const overCap = new anchor.BN(MAX_SUPPLY.toString());
    try {
      await program.methods
        .mintToken(overCap)
        .accounts({ admin: wallet.publicKey })
        .rpc();
      assert.fail("minting past the cap should be rejected");
    } catch (err) {
      assert.include(String(err), "exceed the maximum supply");
    }
  });

  // ── burn_token ───────────────────────────────────────────────

  it("burn_token — burns from the signer's own ATA", async () => {
    const before = readTokenAmount(
      (await provider.connection.getAccountInfo(adminAta))!.data
    );

    await program.methods
      .burnToken(toUnits(100))
      .accounts({ owner: wallet.publicKey })
      .rpc();

    const after = readTokenAmount(
      (await provider.connection.getAccountInfo(adminAta))!.data
    );
    assert.strictEqual(
      before - after,
      BigInt(100) * BigInt(10) ** BigInt(DECIMALS)
    );
  });

  it("burn_token — rejects zero amount", async () => {
    try {
      await program.methods
        .burnToken(new anchor.BN(0))
        .accounts({ owner: wallet.publicKey })
        .rpc();
      assert.fail("zero amount should be rejected");
    } catch (err) {
      assert.include(String(err), "Amount must be greater than zero");
    }
  });

  // ── transfer_token ───────────────────────────────────────────

  it("transfer_token — transfers and creates the recipient ATA", async () => {
    await program.methods
      .transferToken(toUnits(50))
      .accounts({ owner: wallet.publicKey, recipient: recipient.publicKey })
      .rpc();

    const acc = await provider.connection.getAccountInfo(
      ata(recipient.publicKey, mint)
    );
    assert.strictEqual(
      readTokenAmount(acc!.data),
      BigInt(50) * BigInt(10) ** BigInt(DECIMALS)
    );
  });

  it("transfer_token — rejects zero amount", async () => {
    try {
      await program.methods
        .transferToken(new anchor.BN(0))
        .accounts({ owner: wallet.publicKey, recipient: recipient.publicKey })
        .rpc();
      assert.fail("zero amount should be rejected");
    } catch (err) {
      assert.include(String(err), "Amount must be greater than zero");
    }
  });

  // M-2: transfer used to accept any SPL mint, so its events could be used to
  // fake volume for this program. The mint is now pinned by seed derivation.
  it("transfer_token — rejects a foreign mint (M-2)", async () => {
    // A mint this program did not create, made with raw SPL instructions.
    const foreign = Keypair.generate();
    const rent = await provider.connection.getMinimumBalanceForRentExemption(
      82
    );
    const initMintIx = new anchor.web3.TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: foreign.publicKey, isSigner: false, isWritable: true },
        {
          pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"),
          isSigner: false,
          isWritable: false,
        },
      ],
      // InitializeMint: tag 0, decimals, mint_authority, freeze_authority=None
      data: Buffer.concat([
        Buffer.from([0, DECIMALS]),
        wallet.publicKey.toBuffer(),
        Buffer.from([0]),
      ]),
    });
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: foreign.publicKey,
        space: 82,
        lamports: rent,
        programId: TOKEN_PROGRAM_ID,
      }),
      initMintIx
    );
    await provider.sendAndConfirm(tx, [foreign]);

    // The real ATAs are passed explicitly, so the only thing wrong with this
    // transaction is the mint itself — the rejection can only come from the
    // seed derivation that pins `mint` to this program's canonical token.
    try {
      await program.methods
        .transferToken(toUnits(1))
        .accounts({
          owner: wallet.publicKey,
          recipient: recipient.publicKey,
          mint: foreign.publicKey,
          fromAccount: adminAta,
          toAccount: ata(recipient.publicKey, mint),
        } as never)
        .rpc();
      assert.fail("a foreign mint should be rejected");
    } catch (err) {
      // Two layers pin the mint, and which one reports first depends on whether
      // the recipient ATA already exists: ConstraintTokenMint when an existing
      // token account disagrees with the mint passed in, ConstraintSeeds when
      // the mint itself fails to derive. Either is the binding doing its job.
      const message = String(err);
      assert.match(
        message,
        /ConstraintTokenMint|ConstraintSeeds|2014|2006/i,
        `expected a mint-binding rejection, got: ${message}`
      );
    }
  });

  // ── admin transfer ───────────────────────────────────────────

  it("accept_admin — rejects acceptance with no pending proposal", async () => {
    try {
      await program.methods
        .acceptAdmin()
        .accounts({ newAdmin: nextAdmin.publicKey })
        .signers([nextAdmin])
        .rpc();
      assert.fail("acceptance without a proposal should be rejected");
    } catch (err) {
      assert.include(String(err), "No admin transfer is pending");
    }
  });

  it("propose_admin — records the nominee without changing the admin", async () => {
    await program.methods
      .proposeAdmin(nextAdmin.publicKey)
      .accounts({ admin: wallet.publicKey })
      .rpc();

    const cfg = await program.account.config.fetch(config);
    assert.strictEqual(cfg.admin.toBase58(), wallet.publicKey.toBase58());
    assert.strictEqual(
      cfg.pendingAdmin!.toBase58(),
      nextAdmin.publicKey.toBase58()
    );
  });

  it("accept_admin — rejects acceptance by anyone but the nominee", async () => {
    try {
      await program.methods
        .acceptAdmin()
        .accounts({ newAdmin: stranger.publicKey })
        .signers([stranger])
        .rpc();
      assert.fail("a stranger should not be able to accept");
    } catch (err) {
      assert.include(String(err), "Signer is not authorized");
    }
  });

  it("accept_admin — completes the transfer", async () => {
    await program.methods
      .acceptAdmin()
      .accounts({ newAdmin: nextAdmin.publicKey })
      .signers([nextAdmin])
      .rpc();

    const cfg = await program.account.config.fetch(config);
    assert.strictEqual(cfg.admin.toBase58(), nextAdmin.publicKey.toBase58());
    assert.isNull(cfg.pendingAdmin);
  });

  it("mint_token — the previous admin can no longer mint", async () => {
    try {
      await program.methods
        .mintToken(toUnits(1))
        .accounts({ admin: wallet.publicKey })
        .rpc();
      assert.fail("the replaced admin should lose minting rights");
    } catch (err) {
      assert.include(String(err), "Signer is not authorized");
    }
  });

  // ── revoke_mint_authority (must stay last: it is irreversible) ─

  it("revoke_mint_authority — freezes the supply permanently", async () => {
    await program.methods
      .revokeMintAuthority()
      .accounts({ admin: nextAdmin.publicKey })
      .signers([nextAdmin])
      .rpc();

    const mintInfo = await provider.connection.getAccountInfo(mint);
    assert.isTrue(readMintAuthorityIsNone(mintInfo!.data));
  });

  it("mint_token — fails after the authority is revoked", async () => {
    try {
      await program.methods
        .mintToken(toUnits(1))
        .accounts({ admin: nextAdmin.publicKey })
        .signers([nextAdmin])
        .rpc();
      assert.fail("minting after revocation should be impossible");
    } catch (err) {
      assert.match(
        String(err),
        /owner does not match|authority|custom program error/i
      );
    }
  });
});
