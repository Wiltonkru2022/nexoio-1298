import { Grid, Metric } from '@nexoio/ui';
type Stat = { label: string; value: string; note?: string; tone?: 'positive' | 'warning' | 'neutral' };
export function StatGrid({ items }: { items: Stat[] }) {
  return <Grid min={180} className="merchant-stat-grid">{items.map((item) => <Metric key={item.label} label={item.label} value={item.value} note={item.note}/>)}</Grid>;
}
