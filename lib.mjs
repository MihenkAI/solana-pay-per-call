// Shared helpers: config, keys, explorer links.
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";

export const RPC = process.env.RPC || "https://api.devnet.solana.com";
export const LOCAL = /localhost|127\.0\.0\.1/.test(RPC);
// x402 network name: Solana devnet by default, or a local validator (solana-test-validator) when RPC points to it.
export const NETWORK = process.env.NETWORK || (LOCAL ? "solana-localnet" : "solana-devnet");
export const DECIMALS = 6;
export const PRICE = BigInt(process.env.PRICE_UNITS || 10_000); // 0.01 test-USDC (6 decimals)
export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const KEYS = process.env.KEYS || "keys";

export const conn = () => new Connection(RPC, "confirmed");

export function loadOrCreate(name) {
  const p = path.join(KEYS, `${name}.json`);
  if (fs.existsSync(p)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
  fs.mkdirSync(KEYS, { recursive: true });
  const kp = Keypair.generate();
  fs.writeFileSync(p, JSON.stringify([...kp.secretKey]), { mode: 0o600 });
  return kp;
}

export function load(name) {
  const p = path.join(KEYS, `${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`missing ${p} - run "npm run setup" first`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

export function config() {
  const p = path.join(KEYS, "config.json");
  if (!fs.existsSync(p)) throw new Error(`missing ${p} - run "npm run setup" first`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const CLUSTER = LOCAL ? `cluster=custom&customUrl=${encodeURIComponent(RPC)}` : "cluster=devnet";
export const txLink = (sig) => `https://explorer.solana.com/tx/${sig}?${CLUSTER}`;
export const addrLink = (a) => `https://explorer.solana.com/address/${a}?${CLUSTER}`;
export const units = (n) => String(Number((Number(n) / 10 ** DECIMALS).toFixed(4)));
export const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
export const unb64 = (s) => JSON.parse(Buffer.from(s, "base64").toString("utf8"));
