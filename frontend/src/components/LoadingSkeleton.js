export function SkeletonLine({ width = "100%" }) {
  return (
    <div
      className="skeleton-line"
      style={{ width }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <SkeletonLine width="40%" />
      <SkeletonLine width="60%" />
      <SkeletonLine width="80%" />
      <SkeletonLine width="50%" />
    </div>
  );
}

export function AgentCardSkeleton() {
  return (
    <div className="card skeleton-card" style={{ flex: 1, minWidth: 240 }} aria-hidden="true">
      <SkeletonLine width="60%" />
      <SkeletonLine width="30%" />
      <SkeletonLine width="90%" />
      <SkeletonLine width="70%" />
      <SkeletonLine width="85%" />
    </div>
  );
}

export default function LoadingSpinner({ label = "Loading…" }) {
  return (
    <div className="loading-spinner" role="status" aria-label={label}>
      <div className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
