type Stat = { label: string; value: string; note?: string; tone?: 'positive' | 'warning' | 'neutral' };

export function StatGrid({ items }: { items: Stat[] }) {
  return <section className="merchant-stat-grid">{items.map((item) => <article className="merchant-stat" key={item.label}><span>{item.label}</span><strong>{item.value}</strong>{item.note && <small className={item.tone ?? 'neutral'}>{item.note}</small>}</article>)}</section>;
}
