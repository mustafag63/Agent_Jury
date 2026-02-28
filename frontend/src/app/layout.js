import "./globals.css";
import NetworkGuard from "@/components/NetworkGuard";
import Link from "next/link";

export const metadata = {
  title: "Agent Jury MVP",
  description: "Hackathon demo: AI jury + on-chain verdict storage",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <header className="app-header" role="banner">
          <nav aria-label="Main navigation" className="container nav-bar">
            <Link href="/" className="nav-brand">
              Agent Jury
            </Link>
            <ul className="nav-links" role="list">
              <li><Link href="/connect">Connect</Link></li>
              <li><Link href="/submit">Submit</Link></li>
              <li><Link href="/history">History</Link></li>
            </ul>
          </nav>
        </header>
        <main id="main-content" className="container" role="main">
          <NetworkGuard />
          {children}
        </main>
        <footer className="app-footer container" role="contentinfo">
          <p>Agent Jury — AI evaluation + on-chain verdict storage</p>
        </footer>
      </body>
    </html>
  );
}
