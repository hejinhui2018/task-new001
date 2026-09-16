import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, IngestEvent } from '../types';
import { dueEventCount } from './selectors';

export type Speed = 0.5 | 1 | 2 | 4;
export const SPEEDS: Speed[] = [0.5, 1, 2, 4];

export interface PlaybackState {
  running: boolean;
  finished: boolean;
  /** 已投递的事件数 */
  delivered: number;
  /** 场景虚拟时钟（毫秒） */
  virtualMs: number;
  speed: Speed;
}

export interface PlaybackControls extends PlaybackState {
  play: () => void;
  pause: () => void;
  /** 暂停态下投递且仅投递下一个事件 */
  step: () => void;
  /** 回到干净状态并从头播放 */
  replay: () => void;
  setSpeed: (s: Speed) => void;
}

const TICK_MS = 50;

/**
 * 确定性播放器：事件顺序与内容完全由静态场景决定，不使用任何随机源。
 * 墙钟只驱动虚拟时钟的流逝速度；无论暂停/倍速如何操作，
 * 每个 eventId 都按固定顺序、恰好投递一次（重复事件的去重在 reducer 内保证）。
 */
export function usePlayback(
  events: readonly IngestEvent[],
  dispatch: (a: Action) => void,
): PlaybackControls {
  const arrivals = useMemo(() => events.map((e) => e.arriveAtMs), [events]);

  const [running, setRunning] = useState(false);
  const [delivered, setDelivered] = useState(0);
  const [virtualMs, setVirtualMs] = useState(0);
  const [speed, setSpeedState] = useState<Speed>(1);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const wallStart = useRef(0);
  const virtualBase = useRef(0);
  const deliveredRef = useRef(0);
  const speedRef = useRef(speed);
  const runningRef = useRef(false);

  deliveredRef.current = delivered;
  speedRef.current = speed;

  const stopTimer = () => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  const deliverThrough = useCallback(
    (t: number) => {
      const target = dueEventCount(arrivals, t);
      for (let i = deliveredRef.current; i < target; i++) {
        dispatch({ type: 'ingest', event: events[i] });
      }
      if (target !== deliveredRef.current) {
        deliveredRef.current = target;
        setDelivered(target);
      }
      setVirtualMs(t);
      return target;
    },
    [arrivals, events, dispatch],
  );

  const tick = useCallback(() => {
    const elapsed =
      virtualBase.current + (Date.now() - wallStart.current) * speedRef.current;
    const target = deliverThrough(elapsed);
    if (target >= events.length) {
      stopTimer();
      runningRef.current = false;
      setRunning(false);
    }
  }, [deliverThrough, events.length]);

  const play = useCallback(() => {
    if (runningRef.current) return;
    if (deliveredRef.current >= events.length) return;
    wallStart.current = Date.now();
    virtualBase.current = virtualMs;
    runningRef.current = true;
    setRunning(true);
    stopTimer();
    timer.current = setInterval(tick, TICK_MS);
  }, [events.length, tick, virtualMs]);

  const pause = useCallback(() => {
    if (!runningRef.current) return;
    stopTimer();
    runningRef.current = false;
    setRunning(false);
    const elapsed =
      virtualBase.current + (Date.now() - wallStart.current) * speedRef.current;
    deliverThrough(elapsed);
  }, [deliverThrough]);

  const step = useCallback(() => {
    if (runningRef.current) return;
    const i = deliveredRef.current;
    if (i >= events.length) return;
    deliverThrough(events[i].arriveAtMs);
  }, [deliverThrough, events]);

  const resetToClean = useCallback(() => {
    stopTimer();
    runningRef.current = false;
    deliveredRef.current = 0;
    virtualBase.current = 0;
    setRunning(false);
    setDelivered(0);
    setVirtualMs(0);
    dispatch({ type: 'reset' });
  }, [dispatch]);

  /** 回到干净状态并停在 T+0，等待继续 / 单步 */
  const replay = useCallback(() => {
    resetToClean();
  }, [resetToClean]);

  const setSpeed = useCallback(
    (s: Speed) => {
      setSpeedState(s);
      if (runningRef.current) {
        // 以当前虚拟时刻为新基准，保证换速不跳变、不丢事件
        const elapsed =
          virtualBase.current + (Date.now() - wallStart.current) * speedRef.current;
        stopTimer();
        virtualBase.current = elapsed;
        wallStart.current = Date.now();
        speedRef.current = s;
        timer.current = setInterval(tick, TICK_MS);
      }
    },
    [tick],
  );

  useEffect(() => stopTimer, []);

  return {
    running,
    finished: delivered >= events.length,
    delivered,
    virtualMs,
    speed,
    play,
    pause,
    step,
    replay,
    setSpeed,
  };
}
