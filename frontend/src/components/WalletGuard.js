"use client";

import { useEffect, useState, useCallback } from "react";
import { getBrowserProvider, ensureCorrectNetwork } from "@/lib/contract";
import { getSession, setSession } from "@/lib/storage";
import ErrorAlert from "./ErrorAlert";

export default function WalletGuard({ children, requireWallet = true }) {
  const [address, setAddress] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(null);

  const checkWallet = useCallback(async () => {
    try {
      setError(null);
      setChecking(true);

      if (typeof window === "undefined" || !window.ethereum) {
        if (requireWallet) {
          setError({
            message: "MetaMask not detected. Please install MetaMask to continue.",
            category: "wallet",
            retryable: true,
          });
        }
        return;
      }

      const provider = await getBrowserProvider();
      const accounts = await provider.listAccounts();

      if (accounts.length === 0) {
        if (requireWallet) {
          setError({
            message: "Wallet not connected. Please connect your wallet first.",
            category: "wallet",
            retryable: true,
          });
        }
        setSession({ walletAddress: null });
        setAddress(null);
        return;
      }

      const signer = accounts[0];
      const addr = await signer.getAddress();
      setAddress(addr);
      setSession({ walletAddress: addr });
    } catch (err) {
      setError({
        message: err.message || "Wallet check failed",
        category: "wallet",
        retryable: true,
      });
    } finally {
      setChecking(false);
    }
  }, [requireWallet]);

  useEffect(() => {
    checkWallet();

    if (typeof window !== "undefined" && window.ethereum) {
      const onAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          setAddress(null);
          setSession({ walletAddress: null });
          if (requireWallet) {
            setError({
              message: "Wallet disconnected.",
              category: "wallet",
              retryable: true,
            });
          }
        } else {
          setAddress(accounts[0]);
          setSession({ walletAddress: accounts[0] });
          setError(null);
        }
      };

      window.ethereum.on("accountsChanged", onAccountsChanged);
      return () => {
        window.ethereum?.removeListener?.("accountsChanged", onAccountsChanged);
      };
    }
  }, [checkWallet, requireWallet]);

  if (checking) {
    return (
      <div className="card" role="status" aria-label="Checking wallet connection">
        <p>Checking wallet connection…</p>
      </div>
    );
  }

  if (error && requireWallet) {
    return (
      <div className="card">
        <ErrorAlert error={error} onRetry={checkWallet} />
        {!window.ethereum && (
          <p style={{ marginTop: 12 }}>
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="button"
              style={{ display: "inline-block", textDecoration: "none" }}
            >
              Install MetaMask
            </a>
          </p>
        )}
      </div>
    );
  }

  return typeof children === "function"
    ? children({ address, refresh: checkWallet })
    : children;
}
