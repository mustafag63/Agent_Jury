import { Wallet, solidityPackedKeccak256 } from "ethers";
import crypto from "node:crypto";
import config from "../config/index.js";
import logger from "../observability/logger.js";

const log = logger.child({ module: "attestation" });

let cachedWallet = null;
let walletInitialized = false;

function getWallet() {
  if (walletInitialized) return cachedWallet;
  walletInitialized = true;

  const pk = config.attestation.privateKey;
  if (!pk) return null;

  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    log.error("ATTESTATION_PRIVATE_KEY has invalid format — signing disabled");
    return null;
  }

  try {
    cachedWallet = new Wallet(pk);
  } catch (err) {
    log.error({ err }, "failed to initialize wallet");
    cachedWallet = null;
  }
  return cachedWallet;
}

function validateScore(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`Invalid ${name} score for attestation: ${value}`);
  }
  return Math.round(n);
}

export async function signAttestation(
  caseHash,
  feasibility,
  innovation,
  risk,
  finalScore,
  shortVerdict,
) {
  const wallet = getWallet();
  if (!wallet) return null;

  const f = validateScore(feasibility, "feasibility");
  const i = validateScore(innovation, "innovation");
  const r = validateScore(risk, "risk");
  const fs = validateScore(finalScore, "finalScore");

  if (typeof caseHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(caseHash)) {
    throw new Error("Invalid caseHash for attestation");
  }

  const verdict = String(shortVerdict || "").slice(0, 140);
  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000);

  const messageHash = solidityPackedKeccak256(
    ["bytes32", "uint8", "uint8", "uint8", "uint8", "string", "uint256"],
    [caseHash, f, i, r, fs, verdict, timestamp],
  );

  const signature = await wallet.signMessage(Buffer.from(messageHash.slice(2), "hex"));

  return {
    attestor: wallet.address,
    messageHash,
    signature,
    nonce,
    timestamp,
  };
}

export function getAttestorAddress() {
  const wallet = getWallet();
  return wallet?.address ?? null;
}
