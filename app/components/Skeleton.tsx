export function SkeletonCard() {
  return (
    <div className="card" aria-hidden>
      <div className="skeleton skel-line skel-w45" style={{ height: 10 }} />
      <div className="skeleton skel-line skel-w90" style={{ height: 18, marginTop: 12 }} />
      <div className="skeleton skel-line skel-w70" />
      <div className="skeleton skel-line skel-w90" />
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <div className="skeleton" style={{ height: 34, width: 130 }} />
        <div className="skeleton" style={{ height: 34, width: 110 }} />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="cards">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
