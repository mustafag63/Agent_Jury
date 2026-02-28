import { Router } from "express";
import m from "../observability/metrics.js";

const router = Router();

router.get("/metrics", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(m.toPrometheus());
});

router.get("/metrics/json", (_req, res) => {
  res.json(m.getSnapshot());
});

export default router;
