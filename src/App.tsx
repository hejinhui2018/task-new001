import { useMemo, useReducer } from 'react';
import type { Action } from './types';
import { createInitialState, reducer } from './engine/reducer';
import { JITTER_SCENARIO } from './engine/scenario';
import { usePlayback } from './engine/usePlayback';
import { computeStats } from './engine/selectors';
import { TransportBar } from './components/TransportBar';
import { StatsBar } from './components/StatsBar';
import { LivePreview } from './components/LivePreview';
import { Timeline } from './components/Timeline';
import { EventLog } from './components/EventLog';
import { ConflictPanel } from './components/ConflictPanel';

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const playback = usePlayback(JITTER_SCENARIO, dispatch);
  const stats = useMemo(
    () => computeStats(state, playback.delivered, JITTER_SCENARIO.length),
    [state, playback.delivered],
  );

  // 冲突出现即视为高优先级：人工操作暂停播放节奏的决定权在运营手里，
  // 这里不强制暂停事件，但冲突面板会置顶阻断。
  const userDispatch = (a: Action) => dispatch(a);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo" aria-hidden="true">📡</span>
          <div>
            <h1>直播字幕校对台</h1>
            <p className="topbar__sub">场景：网络抖动重放（101 → 103 → 重复 103 → 晚到 102 → 102 修订 v2）</p>
          </div>
        </div>
        <TransportBar playback={playback} totalEvents={JITTER_SCENARIO.length} />
      </header>

      <StatsBar stats={stats} />

      <main className="grid">
        <div className="grid__col grid__col--main">
          <LivePreview state={state} running={playback.running} />
          <Timeline state={state} dispatch={userDispatch} clockMs={playback.virtualMs} />
        </div>
        <div className="grid__col grid__col--side">
          <EventLog log={state.log} />
        </div>
      </main>

      <ConflictPanel
        conflicts={state.conflicts}
        dispatch={userDispatch}
        clockMs={playback.virtualMs}
      />
    </div>
  );
}
