import Link from "next/link";

export default function HomePage() {
  return (
    <div className="card">
      <h2>Demo Flow</h2>
      <ol>
        <li>Connect wallet (MetaMask)</li>
        <li>Submit case for AI evaluation</li>
        <li>Watch 3 AI agents deliberate (off-chain)</li>
        <li>Review final verdict + backend attestation</li>
        <li>Sign and save verdict on-chain (immutable proof)</li>
        <li>View on-chain history with block explorer links</li>
      </ol>

      <div className="trust-info">
        <p>
          <strong>Trust model:</strong> AI evaluation runs off-chain for cost and
          complexity reasons. The backend cryptographically signs (attests) the output.
          You then sign the transaction yourself via MetaMask. The final verdict record
          is stored immutably on the smart contract and can be independently verified
          by anyone on the block explorer.
        </p>
      </div>

      <Link href="/connect">Start demo</Link>
    </div>
  );
}
