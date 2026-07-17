import { View } from 'react-native';

import { selectTaskMinutes } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import type { TaskItem } from '@/core/types';
import { TaskRow } from './task-row';

export function ReorderableTaskList({ tasks }: { tasks: TaskItem[] }) {
  const { data, startTask, pauseTask, reorderTasks } = useReflowStore();
  const sorted = [...tasks].sort((a, b) => a.sortIndex - b.sortIndex);
  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= sorted.length) return;
    const ids = sorted.map((task) => task.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    reorderTasks(ids);
  }
  return <View style={{ gap: 7 }}>{sorted.map((task, index) => <TaskRow key={task.id} task={task} minutes={selectTaskMinutes(data, task.id)} onStart={() => startTask(task.id)} onPause={() => pauseTask(task.id)} onMoveUp={index > 0 ? () => move(index, -1) : undefined} onMoveDown={index < sorted.length - 1 ? () => move(index, 1) : undefined} />)}</View>;
}
