import logger from "../observability/logger.js";
import metrics from "../observability/metrics.js";

export function requestLogger(req, res, next) {
  const elapsed = metrics.httpRequestStart();
  const log = logger.child({ requestId: req.requestId });

  req.log = log;

  log.info({ method: req.method, url: req.originalUrl, ip: req.ip }, "request");

  const onFinish = () => {
    res.removeListener("finish", onFinish);
    res.removeListener("close", onFinish);

    const ms = elapsed();
    metrics.httpRequestEnd(
      () => ms,
      req.method,
      req.route?.path || req.originalUrl,
      res.statusCode,
    );

    const level =
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    log[level](
      {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round(ms),
      },
      "response",
    );
  };

  res.on("finish", onFinish);
  res.on("close", onFinish);

  next();
}
