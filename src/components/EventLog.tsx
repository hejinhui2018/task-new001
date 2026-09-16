import type { LogEntry, LogKind } from '../types';

const KIND_LABEL: Record<LogKind, { text: string; cls: string }> = {
  insert: { text: '入库', cls: 'evt--insert' },
  'gap-opened': { text: '缺口', cls: 'evt--gap' },
  'gap-filled': { text: '补齐', cls: 'evt--fill' },
  duplicate: { text: '重复丢弃', cls: 'evt--dup' },
  'revision-applied': { text: '修订应用', cls: 'evt--rev' },
  'revision-stale': { text: '过期修订', cls: 'evt--stale' },
  'conflict-raised': { text: '冲突', cls: 'evt--conflict' },
  'conflict-keep-human': { text: '保留人工', cls: 'evt--human' },
  'conflict-accept-machine': { text: '接受机器', cls: 'evt--machine' },
  edit: { text: '人工修改', cls: 'evt--human' },
  lock: { text: '锁定', cls: 'evt--human' },
  unlock: { text: '解锁', cls: 'evt--stale' },
  reset: { text: '重置', cls: 'evt--stale' },
};

function fmt(ms: number): string {
  return `T+${(ms / 1000).toFixed(1)}s`;
}

export function EventLog({ log }: { log: LogEntry[] }) {
  return (
    <section className="panel eventlog" aria-label="事件流">
      <header className="panel__header">
        <h2>事件流</h2>
        <span className="panel__hint">最新在上 · 去重 / 缺口 / 修订 / 冲突全程留痕</span>
      </header>
      <ol className="evtlist" aria-live="polite">
        {log.length === 0 && <li className="evtlist__empty">暂无事件，开始播放后在此记录</li>}
        {log.map((e) => {
          const meta = KIND_LABEL[e.kind];
          return (
            <li key={e.id} className={`evt ${meta.cls}`} data-testid={`log-${e.kind}`}>
              <span className="evt__time">{fmt(e.atMs)}</span>
              <span className={`evt__tag tag ${meta.cls}`}>{meta.text}</span>
              <span className="evt__msg">{e.message}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
