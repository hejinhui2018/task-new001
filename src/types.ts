/** 字幕校对台领域模型 */

/** 网络推送到台里的入站事件（机器初稿或机器修订） */
export interface IngestEvent {
  /** 传输层唯一 ID；重传的重复事件携带相同 eventId，用于幂等去重 */
  eventId: string;
  kind: 'caption' | 'revision';
  /** 片段序号，直播顺序即序号顺序 */
  seq: number;
  /** 文本内容版本号，从 1 起单调递增 */
  revision: number;
  text: string;
  /** 场景内逻辑到达时间（毫秒），仅用于确定性调度与展示 */
  arriveAtMs: number;
  label: string;
}

/** 一条已入库的字幕片段 */
export interface CaptionEntry {
  seq: number;
  /** 当前文本对应的版本号 */
  revision: number;
  /** 已知的最高版本号（人工拒绝修订后可能高于 revision） */
  seenRevision: number;
  text: string;
  locked: boolean;
  /** 文本是否被人工改动过 */
  manuallyEdited: boolean;
  /** 入库时是否已有更大序号的片段（即晚到补齐） */
  late: boolean;
  /** 被人工拒绝过的最高机器修订号 */
  declinedRevision?: number;
  originEventId: string;
  arrivedAtMs: number;
}

/** 机器修订撞上人工锁定时产生的待裁决冲突 */
export interface PendingConflict {
  id: string;
  seq: number;
  /** 锁定中的人工版本 */
  currentText: string;
  currentRevision: number;
  /** 新到达的机器修订 */
  incomingText: string;
  incomingRevision: number;
  incomingEventId: string;
  arrivedAtMs: number;
}

export type LogKind =
  | 'insert'
  | 'gap-opened'
  | 'gap-filled'
  | 'duplicate'
  | 'revision-applied'
  | 'revision-stale'
  | 'conflict-raised'
  | 'conflict-keep-human'
  | 'conflict-accept-machine'
  | 'edit'
  | 'lock'
  | 'unlock'
  | 'reset';

export interface LogEntry {
  id: number;
  kind: LogKind;
  seq?: number;
  eventId?: string;
  message: string;
  atMs: number;
}

export interface DeskState {
  bySeq: Record<number, CaptionEntry>;
  /** 已处理过的传输事件 ID，保证幂等 */
  seenEventIds: Record<string, boolean>;
  conflicts: PendingConflict[];
  log: LogEntry[];
  logCounter: number;
  bounds: { first: number; last: number };
  ingestedCount: number;
  duplicateCount: number;
}

export type Action =
  | { type: 'ingest'; event: IngestEvent }
  | { type: 'edit'; seq: number; text: string; atMs: number }
  | { type: 'set-lock'; seq: number; locked: boolean; atMs: number }
  | {
      type: 'resolve-conflict';
      conflictId: string;
      choice: 'human' | 'machine';
      atMs: number;
    }
  | { type: 'reset' };
