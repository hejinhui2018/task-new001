import type { DeskState } from '../types';
import { buildTimeline, onAirSeq } from '../engine/selectors';

interface Props {
  state: DeskState;
  running: boolean;
}

export function LivePreview({ state, running }: Props) {
  const onAir = onAirSeq(state);
  const entry = onAir !== null ? state.bySeq[onAir] : null;
  const nextMissing = buildTimeline(state).find((s) => s.kind === 'gap');

  return (
    <section className="panel preview" aria-label="直播预览">
      <header className="panel__header">
        <h2>直播预览</h2>
        <span className={`onair-badge ${running ? 'onair-badge--live' : 'onair-badge--hold'}`}>
          <span aria-hidden="true">{running ? '●' : '❚❚'}</span>
          {running ? 'LIVE 播出中' : '播出暂停'}
        </span>
      </header>

      <div className="preview__screen" aria-live="polite">
        {entry ? (
          <>
            <div className="preview__meta">
              <span className="badge badge--onair">▶ 当前播出 #{entry.seq}</span>
              <span className="badge">v{entry.revision}</span>
              {entry.locked && <span className="badge badge--locked">🔒 已锁定</span>}
              {entry.manuallyEdited && <span className="badge badge--human">✎ 人工稿</span>}
            </div>
            <p className="preview__text">{entry.text}</p>
          </>
        ) : (
          <p className="preview__text preview__text--empty">
            {running ? '等待第一条字幕到达…' : '尚未开始播出，按“继续”或“单步”推送事件'}
          </p>
        )}
      </div>

      <div className="preview__queue" aria-live="polite">
        {nextMissing ? (
          <p className="queue-note queue-note--gap">
            <span aria-hidden="true">⧖</span>
            播出线在 <strong>#{nextMissing.seq}</strong> 处等待：缺口未补齐，后续字幕不得越过缺口播出
          </p>
        ) : (
          <p className="queue-note queue-note--ok">
            <span aria-hidden="true">✓</span>
            播出线连续，无缺口
          </p>
        )}
      </div>
    </section>
  );
}
