import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { PublicKey, Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { MagicanToken } from "../target/types/magican_token";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.MagicanToken as Program<MagicanToken>;
const wallet = provider.wallet as anchor.Wallet;

const mintKeypair = Keypair.generate();
const mint = mintKeypair.publicKey;

console.log("Wallet:", wallet.publicKey.toString());
console.log("New mint:", mint.toString());

async function main() {
  console.log("Initializing mint...");
  await program.methods
    .initialize()
    .accounts({
      mint: mint,
      authority: wallet.publicKey,
    })
    .signers([mintKeypair])
    .rpc();

  console.log("Mint initialized successfully!");
  console.log("Mint address:", mint.toString());
}

main().catch(console.error);
