import Link from "next/link";

export default function HomePage() {
  return (
    <div className="card">
      <h2>Demo Flow</h2>
      <ol>
        <li>Connect wallet</li>
        <li>Submit case</li>
        <li>Watch agent deliberation</li>
        <li>Review final verdict</li>
        <li>Save + view history on-chain</li>
      </ol>
      <Link href="/connect">Start demo</Link>
    </div>
  );
}
