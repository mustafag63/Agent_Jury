const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export async function evaluateCase(caseText) {
  const res = await fetch(`${BACKEND_URL}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ case_text: caseText })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || "Evaluation failed");
  }
  return data;
}
