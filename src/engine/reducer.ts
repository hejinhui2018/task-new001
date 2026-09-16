import type {
  Action,
  CaptionEntry,
  DeskState,
  IngestEvent,
  LogEntry,
  LogKind,
} from '../types';
import { SCENARIO_BOUNDS } from './scenario';

export function createInitialState(): DeskState {
  return {
    bySeq: {},
    seenEventIds: {},
    conflicts: [],
    log: [],
    logCounter: 0,
    bounds: { ...SCENARIO_BOUNDS },
    ingestedCount: 0,
    duplicateCount: 0,
  };
}

function pushLog(
  state: DeskState,
  kind: LogKind,
  message: string,
  atMs: number,
  seq?: number,
  eventId?: string,
): LogEntry[] {
  const entry: LogEntry = {
    id: state.logCounter,
    kind,
    seq,
    eventId,
    message,
    atMs,
  };
  state.logCounter += 1;
  return [entry, ...state.log];
}

/** 当前已知最大序号；尚未收到任何片段时退化为场景上界 */
function maxKnownSeq(state: DeskState): number {
  const seqs = Object.keys(state.bySeq).map(Number);
  return seqs.length ? Math.max(...seqs) : state.bounds.first - 1;
}

/** 依据日志推算“已报告且尚未补齐”的缺口，避免重复告警 */
function openGapsFromLog(log: LogEntry[]): Set<number> {
  const open = new Set<number>();
  // 日志新的在前，倒序还原时间顺序
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.kind === 'gap-opened' && e.seq !== undefined) open.add(e.seq);
    if (e.kind === 'gap-filled' && e.seq !== undefined) open.delete(e.seq);
  }
  return open;
}

/** 插入 / 版本更新后，在 [first, 已知最大序号] 区间内找出仍缺失的序号 */
function currentMissingSeqs(state: DeskState): number[] {
  const max = maxKnownSeq(state);
  const missing: number[] = [];
  for (let s = state.bounds.first; s <= max; s++) {
    if (!state.bySeq[s]) missing.push(s);
  }
  return missing;
}

function syncGapLogs(state: DeskState, atMs: number): void {
  const reported = openGapsFromLog(state.log);
  const missingNow = new Set(currentMissingSeqs(state));

  // 新缺口：当前缺失但从未报告
  for (const seq of missingNow) {
    if (!reported.has(seq)) {
      state.log = pushLog(
        state,
        'gap-opened',
        `缺口：字幕 #${seq} 尚未到达，时间线保留空位`,
        atMs,
        seq,
      );
      reported.add(seq);
    }
  }
  // 已补齐：报告过但现在不再缺失
  for (const seq of reported) {
    if (!missingNow.has(seq)) {
      state.log = pushLog(state, 'gap-filled', `晚到的字幕 #${seq} 已补齐缺口`, atMs, seq);
    }
  }
}

function ingest(state: DeskState, event: IngestEvent): void {
  // 1) 传输层幂等：相同 eventId 永远只处理一次
  if (state.seenEventIds[event.eventId]) {
    state.duplicateCount += 1;
    state.log = pushLog(
      state,
      'duplicate',
      `重复事件丢弃：${event.label}（eventId=${event.eventId}）`,
      event.arriveAtMs,
      event.seq,
      event.eventId,
    );
    return;
  }
  state.seenEventIds[event.eventId] = true;

  const existing = state.bySeq[event.seq];

  // 2) 修订：作用于已入库片段
  if (event.kind === 'revision') {
    if (!existing) {
      state.log = pushLog(
        state,
        'revision-stale',
        `修订先于初稿到达，#${event.seq} 暂无字幕，已忽略（eventId=${event.eventId}）`,
        event.arriveAtMs,
        event.seq,
        event.eventId,
      );
      return;
    }
    if (event.revision <= existing.seenRevision) {
      state.log = pushLog(
        state,
        'revision-stale',
        `过期修订丢弃：#${event.seq} v${event.revision} ≤ 已知 v${existing.seenRevision}`,
        event.arriveAtMs,
        event.seq,
        event.eventId,
      );
      return;
    }

    existing.seenRevision = event.revision;

    // 内容相同的修订仅抬升版本号，不需要打扰运营
    if (event.text === existing.text) {
      existing.revision = event.revision;
      state.log = pushLog(
        state,
        'revision-applied',
        `#${event.seq} 版本号抬升至 v${event.revision}（内容无变化）`,
        event.arriveAtMs,
        event.seq,
        event.eventId,
      );
      return;
    }

    if (existing.locked) {
      // 3) 人工锁定优先：机器修订不得静默覆盖，挂起为冲突
      const alreadyPending = state.conflicts.some(
        (c) => c.seq === event.seq && c.incomingEventId === event.eventId,
      );
      if (!alreadyPending) {
        state.conflicts = [
          ...state.conflicts,
          {
            id: `conflict-${event.seq}-v${event.revision}`,
            seq: event.seq,
            currentText: existing.text,
            currentRevision: existing.revision,
            incomingText: event.text,
            incomingRevision: event.revision,
            incomingEventId: event.eventId,
            arrivedAtMs: event.arriveAtMs,
          },
        ];
        state.log = pushLog(
          state,
          'conflict-raised',
          `冲突：#${event.seq} 已人工锁定 v${existing.revision}，机器修订 v${event.revision} 待裁决`,
          event.arriveAtMs,
          event.seq,
          event.eventId,
        );
      }
      return;
    }

    existing.text = event.text;
    existing.revision = event.revision;
    state.log = pushLog(
      state,
      'revision-applied',
      `#${event.seq} 机器修订 v${event.revision} 已自动应用`,
      event.arriveAtMs,
      event.seq,
      event.eventId,
    );
    return;
  }

  // 4) 初稿入库（乱序也按序号归位）
  if (existing) {
    // 同序号但不同 eventId：按版本规则处理，不生成第二条字幕
    if (event.revision > existing.seenRevision) {
      state.bySeq[event.seq] = {
        ...existing,
        revision: event.revision,
        seenRevision: event.revision,
        text: existing.locked ? existing.text : event.text,
        originEventId: event.eventId,
      };
    }
  } else {
    const late = event.seq < maxKnownSeq(state);
    const entry: CaptionEntry = {
      seq: event.seq,
      revision: event.revision,
      seenRevision: event.revision,
      text: event.text,
      locked: false,
      manuallyEdited: false,
      late,
      originEventId: event.eventId,
      arrivedAtMs: event.arriveAtMs,
    };
    state.bySeq = { ...state.bySeq, [event.seq]: entry };
    state.ingestedCount += 1;
    state.log = pushLog(
      state,
      'insert',
      `${late ? '晚到字幕补位' : '字幕入库'}：#${event.seq}（eventId=${event.eventId}）`,
      event.arriveAtMs,
      event.seq,
      event.eventId,
    );
  }
  syncGapLogs(state, event.arriveAtMs);
}

export function reducer(state: DeskState, action: Action): DeskState {
  switch (action.type) {
    case 'ingest': {
      const next: DeskState = {
        ...state,
        bySeq: { ...state.bySeq },
        seenEventIds: { ...state.seenEventIds },
        conflicts: [...state.conflicts],
        log: state.log,
      };
      ingest(next, action.event);
      return next;
    }
    case 'edit': {
      const entry = state.bySeq[action.seq];
      if (!entry || entry.text === action.text) return state;
      const next: DeskState = {
        ...state,
        bySeq: {
          ...state.bySeq,
          [action.seq]: { ...entry, text: action.text, manuallyEdited: true },
        },
      };
      next.log = pushLog(
        next,
        'edit',
        `人工修改：#${action.seq}（基于 v${entry.revision}）`,
        action.atMs,
        action.seq,
      );
      return next;
    }
    case 'set-lock': {
      const entry = state.bySeq[action.seq];
      if (!entry || entry.locked === action.locked) return state;
      const next: DeskState = {
        ...state,
        bySeq: {
          ...state.bySeq,
          [action.seq]: { ...entry, locked: action.locked },
        },
      };
      next.log = pushLog(
        next,
        action.locked ? 'lock' : 'unlock',
        `人工${action.locked ? '锁定' : '解锁'}：#${action.seq}`,
        action.atMs,
        action.seq,
      );
      return next;
    }
    case 'resolve-conflict': {
      const conflict = state.conflicts.find((c) => c.id === action.conflictId);
      if (!conflict) return state;
      const entry = state.bySeq[conflict.seq];
      if (!entry) return state;

      const next: DeskState = {
        ...state,
        conflicts: state.conflicts.filter((c) => c.id !== conflict.id),
        bySeq: { ...state.bySeq },
      };

      if (action.choice === 'machine') {
        next.bySeq[conflict.seq] = {
          ...entry,
          text: conflict.incomingText,
          revision: conflict.incomingRevision,
          seenRevision: Math.max(entry.seenRevision, conflict.incomingRevision),
          manuallyEdited: false,
        };
        next.log = pushLog(
          next,
          'conflict-accept-machine',
          `冲突裁决：#${conflict.seq} 接受机器修订 v${conflict.incomingRevision}`,
          action.atMs,
          conflict.seq,
          conflict.incomingEventId,
        );
      } else {
        next.bySeq[conflict.seq] = {
          ...entry,
          seenRevision: Math.max(entry.seenRevision, conflict.incomingRevision),
          declinedRevision: Math.max(entry.declinedRevision ?? 0, conflict.incomingRevision),
        };
        next.log = pushLog(
          next,
          'conflict-keep-human',
          `冲突裁决：#${conflict.seq} 保留人工版本，拒绝机器修订 v${conflict.incomingRevision}`,
          action.atMs,
          conflict.seq,
          conflict.incomingEventId,
        );
      }
      return next;
    }
    case 'reset':
      return createInitialState();
    default:
      return state;
  }
}
