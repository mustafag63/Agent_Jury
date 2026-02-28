import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_AGENT_JURY_CONTRACT || "0xYourDeployedContractAddress";
export const DEFAULT_MONAD_CHAIN_ID_HEX = "0x279f";
export const EXPECTED_CHAIN_ID_RAW =
  process.env.NEXT_PUBLIC_MONAD_CHAIN_ID || DEFAULT_MONAD_CHAIN_ID_HEX;
export const MONAD_CHAIN_NAME = process.env.NEXT_PUBLIC_MONAD_CHAIN_NAME || "Monad Testnet";
export const MONAD_RPC_URL =
  process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
export const MONAD_BLOCK_EXPLORER_URL =
  process.env.NEXT_PUBLIC_MONAD_BLOCK_EXPLORER_URL || "https://testnet.monadexplorer.com";

export const AGENT_JURY_ABI = [
  "function saveVerdict(bytes32 caseHash,uint8 feasibilityScore,uint8 innovationScore,uint8 riskScore,uint8 finalScore,string shortVerdict,bytes attestationSignature) external",
  "function getVerdict(uint256 index) external view returns (tuple(bytes32 caseHash,uint8 feasibilityScore,uint8 innovationScore,uint8 riskScore,uint8 finalScore,string shortVerdict,address submitter,uint256 timestamp))",
  "function getVerdictCount() external view returns (uint256)"
];

function invalidChainIdError(rawChainId) {
  const receivedType = typeof rawChainId;
  let receivedValue = "";

  if (receivedType === "string") {
    receivedValue = rawChainId;
  } else if (receivedType === "object") {
    try {
      receivedValue = JSON.stringify(rawChainId);
    } catch {
      receivedValue = String(rawChainId);
    }
  } else {
    receivedValue = String(rawChainId);
  }

  throw new Error(
    `Invalid chainId from provider: "${receivedValue}" (received type: ${receivedType})`
  );
}

function parseExpectedChainId(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) throw new Error("Missing NEXT_PUBLIC_MONAD_CHAIN_ID");

  if (/^0x[0-9a-fA-F]+$/.test(value)) return BigInt(value);
  if (/^[0-9]+$/.test(value)) return BigInt(value);
  throw new Error(`Invalid NEXT_PUBLIC_MONAD_CHAIN_ID: "${value}"`);
}

function normalizeChainId(rawChainId) {
  if (typeof rawChainId === "bigint") return rawChainId;

  if (typeof rawChainId === "number") {
    if (!Number.isSafeInteger(rawChainId) || rawChainId < 0) {
      invalidChainIdError(rawChainId);
    }
    return BigInt(rawChainId);
  }

  if (typeof rawChainId === "string") {
    const value = rawChainId.trim();
    if (/^0x[0-9a-fA-F]+$/.test(value)) return BigInt(value);
    if (/^[0-9]+$/.test(value)) return BigInt(value);
    invalidChainIdError(rawChainId);
  }

  if (rawChainId && typeof rawChainId === "object" && "toString" in rawChainId) {
    return normalizeChainId(rawChainId.toString());
  }

  invalidChainIdError(rawChainId);
}

function toHexChainId(chainId) {
  return `0x${chainId.toString(16)}`;
}

function getProviderErrorCode(error) {
  if (!error || typeof error !== "object") return null;
  const { code } = error;
  if (typeof code === "number") return code;
  if (typeof code === "string") {
    const parsed = Number.parseInt(code, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function getAddEthereumChainParams(chainIdHex) {
  return {
    chainId: chainIdHex,
    chainName: MONAD_CHAIN_NAME,
    nativeCurrency: {
      name: "MON",
      symbol: "MON",
      decimals: 18
    },
    rpcUrls: [MONAD_RPC_URL],
    blockExplorerUrls: MONAD_BLOCK_EXPLORER_URL ? [MONAD_BLOCK_EXPLORER_URL] : []
  };
}

export function getExpectedChainId() {
  return parseExpectedChainId(EXPECTED_CHAIN_ID_RAW);
}

export async function getBrowserProvider() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask not found");
  }
  return new BrowserProvider(window.ethereum);
}

export async function ensureCorrectNetwork(providerInstance) {
  const provider = providerInstance || (await getBrowserProvider());
  const expected = getExpectedChainId();
  let current = normalizeChainId((await provider.getNetwork()).chainId);

  if (current !== expected) {
    await switchToExpectedNetwork();
    const refreshedProvider = await getBrowserProvider();
    current = normalizeChainId((await refreshedProvider.getNetwork()).chainId);
  }

  if (current !== expected) {
    throw new Error(
      `Wrong network. Switch MetaMask to chain ${toHexChainId(expected)} (${expected.toString()}). Current chain: ${toHexChainId(current)} (${current.toString()}).`
    );
  }
}

export async function getNetworkStatus(providerInstance) {
  const provider = providerInstance || (await getBrowserProvider());
  const expected = getExpectedChainId();
  const current = normalizeChainId((await provider.getNetwork()).chainId);

  return {
    expected,
    current,
    ok: current === expected,
    expectedHex: toHexChainId(expected),
    currentHex: toHexChainId(current)
  };
}

export function onChainChanged(callback) {
  if (typeof window === "undefined" || !window.ethereum?.on) {
    return () => {};
  }

  const handler = async (chainIdValue) => {
    callback(normalizeChainId(chainIdValue));
  };

  window.ethereum.on("chainChanged", handler);
  return () => {
    if (window.ethereum?.removeListener) {
      window.ethereum.removeListener("chainChanged", handler);
    }
  };
}

export async function switchToExpectedNetwork() {
  if (typeof window === "undefined" || !window.ethereum?.request) {
    throw new Error("MetaMask not found");
  }

  const expectedChainId = getExpectedChainId();
  const expectedHex = toHexChainId(expectedChainId);

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: expectedHex }]
    });
  } catch (error) {
    if (getProviderErrorCode(error) !== 4902) {
      throw error;
    }

    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [getAddEthereumChainParams(expectedHex)]
    });

    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: expectedHex }]
    });
  }
}

export async function getReadContract() {
  const provider = new JsonRpcProvider(MONAD_RPC_URL);
  return new Contract(CONTRACT_ADDRESS, AGENT_JURY_ABI, provider);
}

export async function getWriteContract() {
  const provider = await getBrowserProvider();
  await ensureCorrectNetwork(provider);
  const signer = await provider.getSigner();
  return new Contract(CONTRACT_ADDRESS, AGENT_JURY_ABI, signer);
}
