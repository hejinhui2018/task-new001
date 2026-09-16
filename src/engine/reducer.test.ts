import { describe, expect, it } from 'vitest';
import type { DeskState, IngestEvent } from '../types';
import { createInitialState, reducer } from './reducer';
import { JITTER_SCENARIO } from './scenario';
import { buildTimeline, computeStats, onAirSeq } from './selectors';

/** 按场景顺序把前 n 个事件折叠进状态（n 默认为全部） */
function feed(events: readonly IngestEvent[], n = events.length): DeskState {
  let s = createInitialState();
  for (let i = 0; i < n; i++) s = reducer(s, { type: 'ingest', event: events[i] });
  return s;
}

describe('乱序补齐', () => {
  it('103 先到：时间线在 102 处保留缺口，且播出线不得越过缺口', () => {
    const s = feed(JITTER_SCENARIO, 2); // 101, 103
    const slots = buildTimeline(s);

    expect(slots.map((x) => x.seq)).toEqual([101, 102, 103]);
    expect(slots[1].kind).toBe('gap');
    expect(s.bySeq[103]).toBeDefined();
    expect(s.bySeq[102]).toBeUndefined();
    expect(onAirSeq(s)).toBe(101);

    const gapLog = s.log.filter((e) => e.kind === 'gap-opened');
    expect(gapLog).toHaveLength(1);
    expect(gapLog[0].seq).toBe(102);
  });

  it('晚到的 102 自动补回缺口，标记 late，播出线推进到 103', () => {
    const before = feed(JITTER_SCENARIO, 2);
    const s = reducer(before, { type: 'ingest', event: JITTER_SCENARIO[3] }); // 102 晚到

    expect(s.bySeq[102]).toMatchObject({ late: true, seq: 102 });
    expect(buildTimeline(s).every((slot) => slot.kind === 'caption')).toBe(true);
    expect(onAirSeq(s)).toBe(103);

    const fillLog = s.log.find((e) => e.kind === 'gap-filled');
    expect(fillLog?.seq).toBe(102);
  });
});

describe('重复去重', () => {
  it('相同 eventId 的重传事件不会生成第二条字幕，仅计数并留痕', () => {
    const s = feed(JITTER_SCENARIO, 3); // 101, 103, 重复 103

    expect(Object.keys(s.bySeq)).toHaveLength(2);
    expect(s.duplicateCount).toBe(1);
    expect(s.seenEventIds['evt-103']).toBe(true);

    const dupLog = s.log.filter((e) => e.kind === 'duplicate');
    expect(dupLog).toHaveLength(1);
    // 重复投递不得改变 103 的来源与文本
    expect(s.bySeq[103].text).toBe('我们先来看下一组实时数据。');
    expect(s.bySeq[103].originEventId).toBe('evt-103');
  });

  it('同一事件投递任意次，结果与投递一次完全一致（幂等）', () => {
    const once = reducer(createInitialState(), {
      type: 'ingest',
      event: JITTER_SCENARIO[1],
    });
    const thrice = [1, 2, 3].reduce<DeskState>(
      (st) => reducer(st, { type: 'ingest', event: JITTER_SCENARIO[1] }),
      createInitialState(),
    );
    expect(thrice.bySeq[103]).toEqual(once.bySeq[103]);
    expect(thrice.ingestedCount).toBe(1);
    expect(thrice.duplicateCount).toBe(2);
  });
});

describe('版本更新', () => {
  it('未锁定字幕的机器修订自动应用', () => {
    let s = feed(JITTER_SCENARIO, 4); // 102 已晚到补齐
    s = reducer(s, { type: 'ingest', event: JITTER_SCENARIO[4] }); // 102 rev2

    expect(s.bySeq[102].revision).toBe(2);
    expect(s.bySeq[102].text).toBe('半场战罢，双方暂时战成二比二平手。');
    expect(s.conflicts).toHaveLength(0);
    expect(s.log[0].kind).toBe('revision-applied');
  });

  it('过期（版本号不更高）的修订被丢弃', () => {
    let s = feed(JITTER_SCENARIO, 5);
    const stale: IngestEvent = {
      ...JITTER_SCENARIO[4],
      eventId: 'evt-102-old',
      revision: 1,
      label: '102 过期修订 v1',
    };
    s = reducer(s, { type: 'ingest', event: stale });
    expect(s.bySeq[102].revision).toBe(2);
    expect(s.log[0].kind).toBe('revision-stale');
  });
});

describe('锁定冲突', () => {
  const lockAndEdit102 = (s0: DeskState): DeskState => {
    let s = s0;
    s = reducer(s, { type: 'edit', seq: 102, text: '人工稿：半场比分二比二', atMs: 3000 });
    s = reducer(s, { type: 'set-lock', seq: 102, locked: true, atMs: 3000 });
    return s;
  };

  it('锁定后机器修订不覆盖文本，而是挂起冲突', () => {
    let s = lockAndEdit102(feed(JITTER_SCENARIO, 4));
    s = reducer(s, { type: 'ingest', event: JITTER_SCENARIO[4] }); // rev2

    expect(s.bySeq[102].text).toBe('人工稿：半场比分二比二');
    expect(s.bySeq[102].locked).toBe(true);
    expect(s.conflicts).toHaveLength(1);
    expect(s.conflicts[0]).toMatchObject({ seq: 102, incomingRevision: 2 });
    expect(s.log[0].kind).toBe('conflict-raised');
  });

  it('选择保留人工版本：文本不变，记录已知更高版本', () => {
    let s = lockAndEdit102(feed(JITTER_SCENARIO, 4));
    s = reducer(s, { type: 'ingest', event: JITTER_SCENARIO[4] });
    const id = s.conflicts[0].id;
    s = reducer(s, { type: 'resolve-conflict', conflictId: id, choice: 'human', atMs: 4000 });

    expect(s.conflicts).toHaveLength(0);
    expect(s.bySeq[102].text).toBe('人工稿：半场比分二比二');
    expect(s.bySeq[102].revision).toBe(1);
    expect(s.bySeq[102].seenRevision).toBe(2);
    expect(s.bySeq[102].declinedRevision).toBe(2);
    expect(s.log[0].kind).toBe('conflict-keep-human');
  });

  it('选择接受机器版本：文本与版本号更新，人工稿标记清除', () => {
    let s = lockAndEdit102(feed(JITTER_SCENARIO, 4));
    s = reducer(s, { type: 'ingest', event: JITTER_SCENARIO[4] });
    const id = s.conflicts[0].id;
    s = reducer(s, { type: 'resolve-conflict', conflictId: id, choice: 'machine', atMs: 4000 });

    expect(s.bySeq[102].text).toBe('半场战罢，双方暂时战成二比二平手。');
    expect(s.bySeq[102].revision).toBe(2);
    expect(s.bySeq[102].manuallyEdited).toBe(false);
    expect(s.bySeq[102].locked).toBe(true);
    expect(s.log[0].kind).toBe('conflict-accept-machine');
  });
});

describe('无残留重放与确定性', () => {
  it('reset 回到完全干净的初始状态', () => {
    let s = feed(JITTER_SCENARIO);
    s = reducer(s, { type: 'edit', seq: 101, text: '改过', atMs: 100 });
    s = reducer(s, { type: 'set-lock', seq: 101, locked: true, atMs: 100 });
    const reset = reducer(s, { type: 'reset' });

    expect(reset).toEqual(createInitialState());
    expect(Object.keys(reset.bySeq)).toHaveLength(0);
    expect(Object.keys(reset.seenEventIds)).toHaveLength(0);
    expect(reset.conflicts).toHaveLength(0);
    expect(reset.log).toHaveLength(0);
    expect(reset.duplicateCount).toBe(0);
  });

  it('相同操作序列两次折叠得到逐字段相同的状态', () => {
    const run = (): DeskState => {
      let s = feed(JITTER_SCENARIO, 4);
      s = reducer(s, { type: 'edit', seq: 102, text: '人工稿：半场比分二比二', atMs: 3000 });
      s = reducer(s, { type: 'set-lock', seq: 102, locked: true, atMs: 3000 });
      s = reducer(s, { type: 'ingest', event: JITTER_SCENARIO[4] });
      const cid = s.conflicts[0].id;
      s = reducer(s, { type: 'resolve-conflict', conflictId: cid, choice: 'human', atMs: 4000 });
      return s;
    };
    const a = run();
    const b = run();
    // 去掉自增计数器之外的所有内容也应一致；直接整体比较（id 由序号+版本派生，同样确定）
    expect(a).toEqual(b);
  });

  it('重放后统计归零：缺口/重复/冲突/锁定均无残留', () => {
    let s = feed(JITTER_SCENARIO);
    s = reducer(s, { type: 'set-lock', seq: 101, locked: true, atMs: 50 });
    const statsBefore = computeStats(s, JITTER_SCENARIO.length, JITTER_SCENARIO.length);
    expect(statsBefore.duplicates).toBe(1);
    expect(statsBefore.locked).toBe(1);

    const reset = reducer(s, { type: 'reset' });
    const statsAfter = computeStats(reset, 0, JITTER_SCENARIO.length);
    expect(statsAfter).toMatchObject({
      present: 0,
      missing: 3,
      duplicates: 0,
      pendingConflicts: 0,
      locked: 0,
      onAir: null,
      finished: false,
    });
  });
});
