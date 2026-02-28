import { BrowserProvider, Contract } from "ethers";

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_AGENT_JURY_CONTRACT || "0xYourDeployedContractAddress";

// Monad testnet chain ID (decimal 10143 = hex 0x279F)
const EXPECTED_CHAIN_ID =
  Number(process.env.NEXT_PUBLIC_EXPECTED_CHAIN_ID) || 10143;
const EXPECTED_CHAIN_ID_HEX = `0x${EXPECTED_CHAIN_ID.toString(16)}`;

const MONAD_TESTNET_PARAMS = {
  chainId: EXPECTED_CHAIN_ID_HEX,
  chainName: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: ["https://testnet-rpc.monad.xyz"],
  blockExplorerUrls: ["https://testnet.monadexplorer.com"]
};

export const AGENT_JURY_ABI = [
  "function saveVerdict(bytes32 caseHash,uint8 feasibilityScore,uint8 innovationScore,uint8 riskScore,uint8 finalScore,string shortVerdict) external",
  "function getVerdict(uint256 index) external view returns (tuple(bytes32 caseHash,uint8 feasibilityScore,uint8 innovationScore,uint8 riskScore,uint8 finalScore,string shortVerdict,address submitter,uint256 timestamp))",
  "function getVerdictCount() external view returns (uint256)"
];

export async function getBrowserProvider() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask not found");
  }
  return new BrowserProvider(window.ethereum);
}

export async function ensureCorrectNetwork() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask not found");
  }

  const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
  if (parseInt(currentChainId, 16) === EXPECTED_CHAIN_ID) return;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: EXPECTED_CHAIN_ID_HEX }]
    });
  } catch (switchError) {
    // Error code 4902 = chain not added to MetaMask yet
    if (switchError?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [MONAD_TESTNET_PARAMS]
      });
    } else {
      throw new Error(
        `Please switch MetaMask to Monad Testnet (chain ${EXPECTED_CHAIN_ID}).`
      );
    }
  }
}

export async function getReadContract() {
  const provider = await getBrowserProvider();
  return new Contract(CONTRACT_ADDRESS, AGENT_JURY_ABI, provider);
}

export async function getWriteContract() {
  await ensureCorrectNetwork();
  const provider = await getBrowserProvider();
  const signer = await provider.getSigner();
  return new Contract(CONTRACT_ADDRESS, AGENT_JURY_ABI, signer);
}
