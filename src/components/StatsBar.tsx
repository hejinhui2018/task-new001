import type { ReactNode } from 'react';
import type { DeskStats } from '../engine/selectors';

export function StatsBar({ stats }: { stats: DeskStats }) {
  const items: { label: string; value: ReactNode; cls: string; testid: string }[] = [
    { label: '当前播出', value: stats.onAir === null ? '—' : `#${stats.onAir}`, cls: 'stat--onair', testid: 'stat-onair' },
    { label: '缺口', value: stats.missing, cls: stats.missing ? 'stat--gap' : '', testid: 'stat-missing' },
    { label: '重复事件', value: stats.duplicates, cls: stats.duplicates ? 'stat--dup' : '', testid: 'stat-duplicates' },
    { label: '待处理冲突', value: stats.pendingConflicts, cls: stats.pendingConflicts ? 'stat--conflict' : '', testid: 'stat-conflicts' },
    { label: '已锁定', value: stats.locked, cls: stats.locked ? 'stat--locked' : '', testid: 'stat-locked' },
    { label: '已到位 / 预期', value: `${stats.present}/${stats.expected}`, cls: '', testid: 'stat-present' },
  ];

  return (
    <ul className="stats" aria-label="工作台状态">
      {items.map((it) => (
        <li key={it.label} className={`stat ${it.cls}`} data-testid={it.testid}>
          <span className="stat__value">{it.value}</span>
          <span className="stat__label">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}
