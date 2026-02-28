"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserProvider, ensureCorrectNetwork } from "@/lib/contract";
import { setSession } from "@/lib/storage";

export default function ConnectPage() {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function connectWallet() {
    try {
      setError("");
      const provider = await getBrowserProvider();
      await provider.send("eth_requestAccounts", []);
      await ensureCorrectNetwork();
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      setAddress(signerAddress);
      setSession({ walletAddress: signerAddress });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  }

  return (
    <div className="card">
      <h2>1) Connect MetaMask</h2>
      <button className="button" onClick={connectWallet}>
        Connect Wallet
      </button>
      {address && <p>Connected: {address}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button
        className="button"
        style={{ marginTop: 8 }}
        disabled={!address}
        onClick={() => router.push("/submit")}
      >
        Continue to Case Input
      </button>
    </div>
  );
}
