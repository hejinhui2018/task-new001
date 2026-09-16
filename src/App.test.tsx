import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * 应用级集成测试。全程使用“单步”按钮驱动确定性场景，
 * 不依赖任何计时器 / 随机源：每个事件由一次点击精确投递。
 */
describe('字幕校对台（集成）', () => {
  it('完整工作流：乱序 → 去重 → 晚到补齐 → 人工锁定 → 冲突裁决', async () => {
    const user = userEvent.setup();
    render(<App />);

    const timeline = screen.getByRole('region', { name: '字幕时间线' });
    const step = screen.getByRole('button', { name: /单步/ });

    // 初始：干净状态，三个序号都为空位，统计归零
    expect(screen.getByTestId('play-status')).toHaveTextContent('已暂停');
    expect(within(timeline).getByTestId('gap-101')).toBeInTheDocument();
    expect(within(timeline).getByTestId('gap-102')).toBeInTheDocument();
    expect(within(timeline).getByTestId('gap-103')).toBeInTheDocument();
    expect(screen.getByTestId('stat-missing')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-duplicates')).toHaveTextContent('0');

    // 事件 1：101 到达并播出
    await user.click(step);
    expect(within(timeline).getByTestId('caption-101')).toBeInTheDocument();
    expect(screen.getByTestId('stat-onair')).toHaveTextContent('#101');

    // 事件 2：103 乱序先到，102 留下缺口；播出线停在 101
    await user.click(step);
    expect(within(timeline).getByTestId('gap-102')).toBeInTheDocument();
    expect(within(timeline).getByTestId('caption-103')).toBeInTheDocument();
    expect(screen.getByTestId('stat-onair')).toHaveTextContent('#101');
    expect(screen.getByTestId('stat-missing')).toHaveTextContent('1');

    // 事件 3：重复的 103 —— 不得出现两条字幕，重复计数 +1
    await user.click(step);
    expect(within(timeline).getAllByTestId('caption-103')).toHaveLength(1);
    expect(screen.getByTestId('stat-duplicates')).toHaveTextContent('1');
    expect(screen.getByTestId('log-duplicate')).toBeInTheDocument();

    // 事件 4：102 晚到，自动补位，播出线越过缺口推进到 103
    await user.click(step);
    expect(within(timeline).queryByTestId('gap-102')).not.toBeInTheDocument();
    const row102 = within(timeline).getByTestId('caption-102');
    expect(within(row102).getByText('晚到补回')).toBeInTheDocument();
    expect(screen.getByTestId('stat-onair')).toHaveTextContent('#103');
    expect(screen.getByTestId('stat-missing')).toHaveTextContent('0');

    // 在机器修订到达前，人工修改并锁定 102
    await user.click(within(row102).getByRole('button', { name: /修改/ }));
    const editor = screen.getByLabelText('编辑字幕 102');
    await user.clear(editor);
    await user.type(editor, '人工稿：半场比分二比二');
    await user.click(within(row102).getByRole('button', { name: '保存' }));
    await user.click(screen.getByTestId('lock-102'));
    expect(within(row102).getByText('🔒 人工锁定')).toBeInTheDocument();

    // 事件 5：102 机器修订 v2 —— 弹窗阻断，文本未被覆盖
    await user.click(step);
    const dialog = screen.getByTestId('conflict-dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(row102).getByText('人工稿：半场比分二比二')).toBeInTheDocument();
    expect(screen.getByTestId('stat-conflicts')).toHaveTextContent('1');

    // 裁决：保留人工版本
    await user.click(screen.getByTestId('keep-human'));
    expect(screen.queryByTestId('conflict-dialog')).not.toBeInTheDocument();
    expect(within(row102).getByText('人工稿：半场比分二比二')).toBeInTheDocument();
    expect(within(row102).getByText(/拒绝过 v2/)).toBeInTheDocument();
    expect(screen.getByTestId('log-conflict-keep-human')).toBeInTheDocument();
    expect(screen.getByTestId('stat-conflicts')).toHaveTextContent('0');

    // 重放：一切回到干净状态，无任何残留
    await user.click(screen.getByRole('button', { name: /重放/ }));
    expect(within(timeline).getByTestId('gap-101')).toBeInTheDocument();
    expect(within(timeline).getByTestId('gap-102')).toBeInTheDocument();
    expect(within(timeline).getByTestId('gap-103')).toBeInTheDocument();
    expect(within(timeline).queryByTestId(/caption-/)).not.toBeInTheDocument();
    expect(screen.getByTestId('stat-missing')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-duplicates')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-conflicts')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-locked')).toHaveTextContent('0');
    expect(screen.getByText(/暂无事件/)).toBeInTheDocument();
    expect(screen.getByText('事件 0/5')).toBeInTheDocument();
  });

  it('未锁定时收到机器修订：自动应用且不弹冲突框', async () => {
    const user = userEvent.setup();
    render(<App />);
    const step = screen.getByRole('button', { name: /单步/ });

    for (let i = 0; i < 5; i++) await user.click(step);

    expect(screen.queryByTestId('conflict-dialog')).not.toBeInTheDocument();
    const row102 = screen.getByTestId('caption-102');
    expect(within(row102).getByText('半场战罢，双方暂时战成二比二平手。')).toBeInTheDocument();
    expect(within(row102).getByText('v2')).toBeInTheDocument();
    expect(screen.getByTestId('log-revision-applied')).toBeInTheDocument();
    expect(screen.getByTestId('stat-conflicts')).toHaveTextContent('0');
  });

  it('重放后再走一遍，结果与第一次相同（确定性）', async () => {
    const user = userEvent.setup();
    render(<App />);
    const step = screen.getByRole('button', { name: /单步/ });

    const walkToGap = async () => {
      await user.click(step); // 101
      await user.click(step); // 103
    };

    await walkToGap();
    expect(screen.getByTestId('stat-onair')).toHaveTextContent('#101');
    expect(screen.getByTestId('gap-102')).toBeInTheDocument();

    await user.click(step); // 重复
    expect(screen.getByTestId('stat-duplicates')).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: /重放/ }));
    await walkToGap();

    // 第二轮同一时刻：状态完全一致
    expect(screen.getByTestId('stat-onair')).toHaveTextContent('#101');
    expect(screen.getByTestId('gap-102')).toBeInTheDocument();
    expect(screen.getByTestId('stat-duplicates')).toHaveTextContent('0');
    expect(screen.getByText('事件 2/5')).toBeInTheDocument();
  });
});
