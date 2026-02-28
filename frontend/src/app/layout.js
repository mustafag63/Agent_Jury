import "./globals.css";

export const metadata = {
  title: "Agent Jury MVP",
  description: "Hackathon demo: AI jury + on-chain verdict storage"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main className="container">
          <h1>Agent Jury</h1>
          <p>Three AI agents debate. Final judge decides. Save result on-chain.</p>
          {children}
        </main>
      </body>
    </html>
  );
}
