const startTime = Date.now();

const counters = {};
const histograms = {};

function inc(name, labels = {}, amount = 1) {
  const key = metricKey(name, labels);
  counters[key] = (counters[key] || 0) + amount;
}

function observe(name, labels = {}, value) {
  const key = metricKey(name, labels);
  if (!histograms[key]) {
    histograms[key] = { count: 0, sum: 0, min: Infinity, max: -Infinity };
  }
  const h = histograms[key];
  h.count++;
  h.sum += value;
  if (value < h.min) h.min = value;
  if (value > h.max) h.max = value;
}

function metricKey(name, labels) {
  const lbl = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
  return lbl ? `${name}{${lbl}}` : name;
}

function timer() {
  const start = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - start) / 1e6;
}

// ── HTTP metrics ────────────────────────────────

function httpRequestStart() {
  return timer();
}

function httpRequestEnd(elapsedFn, method, path, statusCode) {
  const ms = elapsedFn();
  inc("http_requests_total", { method, path, status: String(statusCode) });
  observe("http_request_duration_ms", { method, path }, ms);
}

// ── LLM metrics ─────────────────────────────────

function llmCallStart() {
  return timer();
}

function llmCallEnd(elapsedFn, { provider, model, success }) {
  const ms = elapsedFn();
  inc("llm_calls_total", {
    provider,
    model,
    status: success ? "success" : "error",
  });
  observe("llm_call_duration_ms", { provider, model }, ms);
}

function llmFallback(fromProvider, fromModel, toProvider, toModel) {
  inc("llm_fallbacks_total", {
    from: `${fromProvider}/${fromModel}`,
    to: `${toProvider}/${toModel}`,
  });
}

// ── Agent metrics ───────────────────────────────

function agentRunStart() {
  return timer();
}

function agentRunEnd(elapsedFn, { role, success }) {
  const ms = elapsedFn();
  inc("agent_runs_total", { role, status: success ? "success" : "error" });
  observe("agent_run_duration_ms", { role }, ms);
}

// ── Evaluation pipeline metrics ─────────────────

function evaluationStart() {
  return timer();
}

function evaluationEnd(elapsedFn, { decision, success }) {
  const ms = elapsedFn();
  inc("evaluations_total", {
    decision: decision || "error",
    status: success ? "success" : "error",
  });
  observe("evaluation_duration_ms", {}, ms);
}

// ── Prometheus export ───────────────────────────

function toPrometheus() {
  const lines = [];
  const uptimeMs = Date.now() - startTime;

  lines.push("# HELP uptime_seconds Server uptime in seconds");
  lines.push("# TYPE uptime_seconds gauge");
  lines.push(`uptime_seconds ${(uptimeMs / 1000).toFixed(1)}`);
  lines.push("");

  const counterNames = new Set();
  const histoNames = new Set();

  for (const key of Object.keys(counters)) {
    counterNames.add(key.split("{")[0]);
  }
  for (const key of Object.keys(histograms)) {
    histoNames.add(key.split("{")[0]);
  }

  for (const name of counterNames) {
    lines.push(`# HELP ${name} Counter`);
    lines.push(`# TYPE ${name} counter`);
    for (const [key, val] of Object.entries(counters)) {
      if (key.startsWith(name)) {
        lines.push(`${key} ${val}`);
      }
    }
    lines.push("");
  }

  for (const name of histoNames) {
    lines.push(`# HELP ${name} Histogram summary`);
    lines.push(`# TYPE ${name} summary`);
    for (const [key, h] of Object.entries(histograms)) {
      if (key.startsWith(name)) {
        const lbl = key.includes("{") ? key.slice(key.indexOf("{")) : "";
        const base = key.split("{")[0];
        lines.push(`${base}_count${lbl} ${h.count}`);
        lines.push(`${base}_sum${lbl} ${h.sum.toFixed(1)}`);
        lines.push(`${base}_min${lbl} ${h.min === Infinity ? 0 : h.min.toFixed(1)}`);
        lines.push(`${base}_max${lbl} ${h.max === -Infinity ? 0 : h.max.toFixed(1)}`);
        lines.push(`${base}_avg${lbl} ${h.count > 0 ? (h.sum / h.count).toFixed(1) : 0}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function getSnapshot() {
  const uptimeMs = Date.now() - startTime;
  return {
    uptime_seconds: Math.round(uptimeMs / 1000),
    counters: { ...counters },
    histograms: Object.fromEntries(
      Object.entries(histograms).map(([k, h]) => [
        k,
        {
          ...h,
          avg: h.count > 0 ? Math.round((h.sum / h.count) * 10) / 10 : 0,
          min: h.min === Infinity ? 0 : Math.round(h.min * 10) / 10,
          max: h.max === -Infinity ? 0 : Math.round(h.max * 10) / 10,
        },
      ]),
    ),
  };
}

export default {
  inc,
  observe,
  timer,

  httpRequestStart,
  httpRequestEnd,

  llmCallStart,
  llmCallEnd,
  llmFallback,

  agentRunStart,
  agentRunEnd,

  evaluationStart,
  evaluationEnd,

  toPrometheus,
  getSnapshot,
};
