import { useEffect, useState } from 'react';
import type { Action, DeskState } from '../types';
import { buildTimeline, onAirSeq } from '../engine/selectors';

interface Props {
  state: DeskState;
  dispatch: (a: Action) => void;
  clockMs: number;
}

export function Timeline({ state, dispatch, clockMs }: Props) {
  const slots = buildTimeline(state);
  const onAir = onAirSeq(state);

  return (
    <section className="panel" aria-label="字幕时间线">
      <header className="panel__header">
        <h2>字幕时间线</h2>
        <span className="panel__hint">按序号排列 · 缺失片段保留空位 · 可直接编辑后锁定</span>
      </header>

      <ol className="timeline">
        {slots.map((slot) =>
          slot.kind === 'gap' ? (
            <li key={slot.seq} className="trow trow--gap" data-testid={`gap-${slot.seq}`}>
              <div className="trow__seq">
                <span className="seqnum seqnum--gap">#{slot.seq}</span>
              </div>
              <div className="trow__body">
                <p className="gap-label">
                  <span aria-hidden="true" className="gap-icon">⚠</span>
                  缺失片段 —— 等待到达（晚到后自动补回此处）
                </p>
                <div className="gap-track" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
              <div className="trow__status">
                <span className="tag tag--gap">缺口</span>
              </div>
            </li>
          ) : (
            <CaptionRow
              key={slot.seq}
              state={state}
              dispatch={dispatch}
              seq={slot.seq}
              clockMs={clockMs}
              isOnAir={onAir === slot.seq}
            />
          ),
        )}
      </ol>
    </section>
  );
}

interface RowProps {
  state: DeskState;
  dispatch: (a: Action) => void;
  seq: number;
  clockMs: number;
  isOnAir: boolean;
}

function CaptionRow({ state, dispatch, seq, clockMs, isOnAir }: RowProps) {
  const entry = state.bySeq[seq]!;
  const [draft, setDraft] = useState(entry.text);
  const [editing, setEditing] = useState(false);

  // 机器版本变化（且当前未在编辑）时同步草稿
  useEffect(() => {
    if (!editing) setDraft(entry.text);
  }, [entry.text, editing]);

  const save = () => {
    const text = draft.trim();
    if (text && text !== entry.text) {
      dispatch({ type: 'edit', seq, text, atMs: clockMs });
    } else {
      setDraft(entry.text);
    }
    setEditing(false);
  };

  const toggleLock = () => {
    if (editing) save();
    dispatch({ type: 'set-lock', seq, locked: !entry.locked, atMs: clockMs });
  };

  return (
    <li
      className={`trow ${entry.locked ? 'trow--locked' : ''} ${isOnAir ? 'trow--onair' : ''}`}
      data-testid={`caption-${seq}`}
    >
      <div className="trow__seq">
        <span className="seqnum">#{seq}</span>
        {isOnAir && (
          <span className="tag tag--onair" data-testid="onair-tag">
            ▶ 播出
          </span>
        )}
        {entry.late && <span className="tag tag--late">晚到补回</span>}
      </div>

      <div className="trow__body">
        {editing ? (
          <textarea
            className="caption-edit"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
            aria-label={`编辑字幕 ${seq}`}
          />
        ) : (
          <p
            className={`caption-text ${entry.manuallyEdited ? 'caption-text--human' : ''}`}
            onDoubleClick={() => !entry.locked && setEditing(true)}
            title={entry.locked ? '已锁定，先解锁才能修改' : '双击编辑'}
          >
            {entry.text}
          </p>
        )}
        <div className="trow__meta">
          <span className="tag">v{entry.revision}</span>
          {entry.seenRevision > entry.revision && (
            <span className="tag tag--declined" title={`已拒绝机器修订 v${entry.seenRevision}`}>
              拒绝过 v{entry.seenRevision}
            </span>
          )}
          {entry.manuallyEdited && <span className="tag tag--human">✎ 人工修改</span>}
          {entry.locked && <span className="tag tag--locked">🔒 人工锁定</span>}
        </div>
      </div>

      <div className="trow__actions">
        {editing ? (
          <>
            <button type="button" className="btn btn--primary btn--sm" onClick={save}>
              保存
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                setDraft(entry.text);
                setEditing(false);
              }}
            >
              取消
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setEditing(true)}
              disabled={entry.locked}
            >
              ✎ 修改
            </button>
            <button
              type="button"
              className={`btn btn--sm ${entry.locked ? 'btn--warn' : 'btn--primary'}`}
              onClick={toggleLock}
              aria-pressed={entry.locked}
              data-testid={`lock-${seq}`}
            >
              {entry.locked ? '🔓 解锁' : '🔒 锁定'}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
