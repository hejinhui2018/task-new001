import type { IngestEvent } from '../types';

/**
 * 固定的“网络抖动”重放脚本。完全静态、无随机数：
 *
 *  T+0.0s  101 初稿         正常到达
 *  T+0.9s  103 初稿         乱序：102 缺失，时间线留下缺口
 *  T+1.7s  103 重传         重复事件（eventId 相同），必须丢弃
 *  T+2.5s  102 初稿         晚到，自动补回缺口
 *  T+3.4s  102 机器修订 v2  若 102 已被人工锁定则产生冲突
 *
 * 相同的播放操作永远产生相同的结果。
 */
export const JITTER_SCENARIO: readonly IngestEvent[] = [
  {
    eventId: 'evt-101',
    kind: 'caption',
    seq: 101,
    revision: 1,
    text: '各位观众晚上好，欢迎收看本场直播。',
    arriveAtMs: 0,
    label: '101 初稿',
  },
  {
    eventId: 'evt-103',
    kind: 'caption',
    seq: 103,
    revision: 1,
    text: '我们先来看下一组实时数据。',
    arriveAtMs: 900,
    label: '103 初稿（乱序）',
  },
  {
    // 与上一条完全相同的 eventId：网络重传造成的重复投递
    eventId: 'evt-103',
    kind: 'caption',
    seq: 103,
    revision: 1,
    text: '我们先来看下一组实时数据。',
    arriveAtMs: 1700,
    label: '103 重传（重复）',
  },
  {
    eventId: 'evt-102',
    kind: 'caption',
    seq: 102,
    revision: 1,
    text: '上半场双方比分暂时持平。',
    arriveAtMs: 2500,
    label: '102 初稿（晚到）',
  },
  {
    eventId: 'evt-102-rev2',
    kind: 'revision',
    seq: 102,
    revision: 2,
    text: '半场战罢，双方暂时战成二比二平手。',
    arriveAtMs: 3400,
    label: '102 机器修订 v2',
  },
];

export const SCENARIO_BOUNDS = { first: 101, last: 103 };
