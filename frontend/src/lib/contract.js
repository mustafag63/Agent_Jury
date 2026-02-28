import { BrowserProvider, Contract } from "ethers";

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_AGENT_JURY_CONTRACT || "0xYourDeployedContractAddress";

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

export async function getReadContract() {
  const provider = await getBrowserProvider();
  return new Contract(CONTRACT_ADDRESS, AGENT_JURY_ABI, provider);
}

export async function getWriteContract() {
  const provider = await getBrowserProvider();
  const signer = await provider.getSigner();
  return new Contract(CONTRACT_ADDRESS, AGENT_JURY_ABI, signer);
}
