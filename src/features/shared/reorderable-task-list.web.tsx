import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { selectTaskMinutes } from '@/core/selectors';
import { useReflowStore } from '@/core/store';
import type { TaskItem } from '@/core/types';
import { TaskRow } from './task-row';

function SortableTask({ task }: { task: TaskItem }) {
  const { data, startTask, pauseTask } = useReflowStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div ref={setNodeRef} data-testid={`sortable-${task.id}`} {...attributes} {...listeners} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.64 : 1, cursor: 'grab', touchAction: 'manipulation' }}>
      <TaskRow task={task} minutes={selectTaskMinutes(data, task.id)} onStart={() => startTask(task.id)} onPause={() => pauseTask(task.id)} />
    </div>
  );
}

export function ReorderableTaskList({ tasks }: { tasks: TaskItem[] }) {
  const { reorderTasks } = useReflowStore();
  const sorted = [...tasks].sort((a, b) => a.sortIndex - b.sortIndex);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = sorted.findIndex((task) => task.id === event.active.id);
    const newIndex = sorted.findIndex((task) => task.id === event.over?.id);
    reorderTasks(arrayMove(sorted, oldIndex, newIndex).map((task) => task.id));
  }
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}><SortableContext items={sorted.map((task) => task.id)} strategy={verticalListSortingStrategy}><div style={{ display: 'grid', gap: 7 }}>{sorted.map((task) => <SortableTask key={task.id} task={task} />)}</div></SortableContext></DndContext>;
}
