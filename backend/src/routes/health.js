import { Router } from "express";
import metrics from "../observability/metrics.js";

const router = Router();

router.get("/health", (_req, res) => {
  const snapshot = metrics.getSnapshot();
  const memUsage = process.memoryUsage();

  res.json({
    ok: true,
    service: "agent-jury-backend",
    uptime_seconds: snapshot.uptime_seconds,
    memory: {
      rss_mb: Math.round(memUsage.rss / 1048576),
      heap_used_mb: Math.round(memUsage.heapUsed / 1048576),
      heap_total_mb: Math.round(memUsage.heapTotal / 1048576),
    },
  });
});

export default router;
