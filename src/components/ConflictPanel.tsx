import type { Action, PendingConflict } from '../types';

interface Props {
  conflicts: PendingConflict[];
  dispatch: (a: Action) => void;
  clockMs: number;
}

/** 锁定字幕收到机器修订时的裁决面板：绝不静默覆盖 */
export function ConflictPanel({ conflicts, dispatch, clockMs }: Props) {
  if (conflicts.length === 0) return null;
  const conflict = conflicts[0];

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        aria-describedby="conflict-desc"
        data-testid="conflict-dialog"
      >
        <h2 id="conflict-title" className="modal__title">
          ⚠ 版本冲突：字幕 #{conflict.seq} 已被人工锁定
        </h2>
        <p id="conflict-desc" className="modal__desc">
          机器修订 v{conflict.incomingRevision} 到达，但该字幕已锁定为人工版本。
          系统<strong>不会自动覆盖</strong>，请选择保留哪一版。
        </p>

        <div className="conflict-grid">
          <div className="conflict-card conflict-card--human">
            <h3>🔒 当前人工版本（v{conflict.currentRevision}）</h3>
            <p>{conflict.currentText}</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() =>
                dispatch({
                  type: 'resolve-conflict',
                  conflictId: conflict.id,
                  choice: 'human',
                  atMs: clockMs,
                })
              }
              data-testid="keep-human"
            >
              保留人工版本
            </button>
          </div>
          <div className="conflict-card conflict-card--machine">
            <h3>🤖 新机器修订（v{conflict.incomingRevision}）</h3>
            <p>{conflict.incomingText}</p>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() =>
                dispatch({
                  type: 'resolve-conflict',
                  conflictId: conflict.id,
                  choice: 'machine',
                  atMs: clockMs,
                })
              }
              data-testid="accept-machine"
            >
              接受机器新版本
            </button>
          </div>
        </div>

        {conflicts.length > 1 && (
          <p className="modal__queue">另有 {conflicts.length - 1} 条冲突等待处理</p>
        )}
      </div>
    </div>
  );
}
