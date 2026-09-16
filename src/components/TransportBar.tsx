import type { PlaybackControls } from '../engine/usePlayback';
import { SPEEDS } from '../engine/usePlayback';

interface Props {
  playback: PlaybackControls;
  totalEvents: number;
}

function formatClock(ms: number): string {
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(1).padStart(4, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}

export function TransportBar({ playback, totalEvents }: Props) {
  const { running, finished, delivered, virtualMs, speed } = playback;

  const status = finished ? '已播完' : running ? '播放中' : '已暂停';

  return (
    <div className="transport" aria-label="播放控制">
      <div className="transport__state">
        <span
          className={`dot ${running ? 'dot--live' : 'dot--paused'}`}
          aria-hidden="true"
        >
          {running ? '●' : '❚❚'}
        </span>
        <strong data-testid="play-status">{status}</strong>
        <span className="transport__clock" aria-label="场景时钟">
          T+{formatClock(virtualMs)}
        </span>
        <span className="transport__progress">
          事件 {delivered}/{totalEvents}
        </span>
      </div>

      <div className="transport__buttons">
        {running ? (
          <button type="button" className="btn" onClick={playback.pause}>
            ❚❚ 暂停
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={playback.play}
            disabled={finished}
          >
            ▶ 继续
          </button>
        )}
        <button
          type="button"
          className="btn"
          onClick={playback.step}
          disabled={running || finished}
          title="暂停状态下投递下一个事件"
        >
          ⏭ 单步
        </button>
        <button type="button" className="btn btn--danger" onClick={playback.replay}>
          ↻ 重放（清空重来）
        </button>
      </div>

      <fieldset className="speeds" aria-label="倍速">
        <legend className="sr-only">倍速</legend>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip ${speed === s ? 'chip--active' : ''}`}
            aria-pressed={speed === s}
            onClick={() => playback.setSpeed(s)}
          >
            {s}×
          </button>
        ))}
      </fieldset>
    </div>
  );
}
