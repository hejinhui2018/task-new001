import type { CaptionEntry, DeskState } from '../types';

export type TimelineSlot =
  | { seq: number; kind: 'gap'; expected: true }
  | { seq: number; kind: 'caption'; entry: CaptionEntry };

/** 时间线：按序号展开 [first,last]，缺失序号渲染为明显空位 */
export function buildTimeline(state: DeskState): TimelineSlot[] {
  const slots: TimelineSlot[] = [];
  for (let seq = state.bounds.first; seq <= state.bounds.last; seq++) {
    const entry = state.bySeq[seq];
    slots.push(entry ? { seq, kind: 'caption', entry } : { seq, kind: 'gap', expected: true });
  }
  return slots;
}

/**
 * 当前播出序号：遵循“不得越过缺口播出”的直播规则——
 * 从 first 起连续存在的最大序号。103 先于 102 到达时只能排队等待。
 */
export function onAirSeq(state: DeskState): number | null {
  let seq = state.bounds.first;
  // bounds.first 之前没有内容时返回 null
  if (!state.bySeq[seq]) return null;
  while (state.bySeq[seq + 1]) seq += 1;
  return seq;
}

export interface DeskStats {
  expected: number;
  present: number;
  missing: number;
  duplicates: number;
  pendingConflicts: number;
  locked: number;
  onAir: number | null;
  finished: boolean;
}

export function computeStats(state: DeskState, deliveredCount: number, totalEvents: number): DeskStats {
  let present = 0;
  let locked = 0;
  for (const slot of buildTimeline(state)) {
    if (slot.kind === 'caption') {
      present += 1;
      if (slot.entry.locked) locked += 1;
    }
  }
  return {
    expected: state.bounds.last - state.bounds.first + 1,
    present,
    missing: state.bounds.last - state.bounds.first + 1 - present,
    duplicates: state.duplicateCount,
    pendingConflicts: state.conflicts.length,
    locked,
    onAir: onAirSeq(state),
    finished: deliveredCount >= totalEvents,
  };
}

/** 返回虚拟时刻 t 之前（含）应投递的事件下标区间，供调度器与测试共用 */
export function dueEventCount(arrivals: readonly number[], t: number): number {
  let n = 0;
  while (n < arrivals.length && arrivals[n] <= t) n += 1;
  return n;
}
