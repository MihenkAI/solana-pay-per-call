// One-time devnet setup: a test USDC mint (6 decimals), seller and agent wallets, token accounts,
// and a starting balance for the agent. Needs keys/payer.json with a little devnet SOL.
import { LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import fs from "node:fs";
import path from "node:path";
import { conn, load, loadOrCreate, KEYS, DECIMALS, LOCAL, txLink, addrLink } from "./lib.mjs";

const c = conn();
// On devnet the payer must already hold a little SOL (faucet.solana.com); on a local validator we airdrop it.
const payer = LOCAL ? loadOrCreate("payer") : load("payer");
if (LOCAL && (await c.getBalance(payer.publicKey)) < LAMPORTS_PER_SOL) {
  await c.confirmTransaction(await c.requestAirdrop(payer.publicKey, 10 * LAMPORTS_PER_SOL), "confirmed");
}
const seller = loadOrCreate("seller");
const agent = loadOrCreate("agent");
console.log("payer ", payer.publicKey.toBase58(), (await c.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL, "SOL");

const cfgPath = path.join(KEYS, "config.json");
let cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};
// To use Circle's devnet USDC instead, put {"mint": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"} in keys/config.json
// before running setup and fund the agent wallet from faucet.circle.com.
if (!cfg.mint) {
  const mint = await createMint(c, payer, payer.publicKey, null, DECIMALS);
  cfg.mint = mint.toBase58();
  cfg.ownMint = true;
  console.log("created test USDC mint", cfg.mint);
}
const { PublicKey } = await import("@solana/web3.js");
const mint = new PublicKey(cfg.mint);
const sellerAta = await getOrCreateAssociatedTokenAccount(c, payer, mint, seller.publicKey);
const agentAta = await getOrCreateAssociatedTokenAccount(c, payer, mint, agent.publicKey);
cfg = { ...cfg, seller: seller.publicKey.toBase58(), sellerAta: sellerAta.address.toBase58(),
        agent: agent.publicKey.toBase58(), agentAta: agentAta.address.toBase58() };
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

if (cfg.ownMint && Number(agentAta.amount) < 1_000_000) {
  const sig = await mintTo(c, payer, mint, agentAta.address, payer, 5_000_000n);
  console.log("minted 5.00 test USDC to the agent", txLink(sig));
}
if ((await c.getBalance(agent.publicKey)) < 0.02 * LAMPORTS_PER_SOL) {
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: agent.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }));
  const sig = await sendAndConfirmTransaction(c, tx, [payer]);
  console.log("sent 0.05 SOL to the agent for fees", txLink(sig));
}
console.log("mint  ", addrLink(cfg.mint));
console.log("seller", addrLink(cfg.seller));
console.log("agent ", addrLink(cfg.agent));
