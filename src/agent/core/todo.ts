export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
  activeText?: string;
  updatedAt: number;
}

export interface TodoInputItem {
  id?: string;
  text: string;
  status: TodoStatus;
  activeText?: string;
}

const TODO_MARKERS: Record<TodoStatus, string> = {
  pending: '[ ]',
  in_progress: '[>]',
  completed: '[x]',
};

export function validateAndNormalizeTodos(items: TodoInputItem[], now: number = Date.now()): TodoItem[] {
  if (!Array.isArray(items)) {
    throw new Error('Todo items must be an array');
  }

  if (items.length > 20) {
    throw new Error('Max 20 todo items allowed');
  }

  const seenIds = new Set<string>();
  let inProgressCount = 0;

  return items.map((item, index) => {
    const id = String(item.id ?? index + 1).trim();
    const text = String(item.text ?? '').trim();
    const status = String(item.status ?? '').trim() as TodoStatus;
    const activeText = typeof item.activeText === 'string' ? item.activeText.trim() : undefined;

    if (!id) {
      throw new Error(`Todo item ${index + 1}: id is required`);
    }
    if (seenIds.has(id)) {
      throw new Error(`Todo item ${id}: duplicate id`);
    }
    seenIds.add(id);

    if (!text) {
      throw new Error(`Todo item ${id}: text is required`);
    }
    if (status !== 'pending' && status !== 'in_progress' && status !== 'completed') {
      throw new Error(`Todo item ${id}: invalid status '${status}'`);
    }

    if (status === 'in_progress') {
      inProgressCount += 1;
    }

    return {
      id,
      text,
      status,
      ...(activeText ? { activeText } : {}),
      updatedAt: now,
    };
  }).map((item) => {
    if (inProgressCount > 1) {
      throw new Error('Only one todo item can be in_progress at a time');
    }
    return item;
  });
}

export function renderTodoList(items: TodoItem[]): string {
  if (items.length === 0) {
    return 'No todos.';
  }

  const lines = items.map((item) => {
    const label = item.status === 'in_progress' && item.activeText ? item.activeText : item.text;
    return `${TODO_MARKERS[item.status]} #${item.id}: ${label}`;
  });
  const completed = items.filter(item => item.status === 'completed').length;
  lines.push(`\n(${completed}/${items.length} completed)`);
  return lines.join('\n');
}

export function summarizeTodoCounts(items: TodoItem[]): {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
} {
  return {
    total: items.length,
    completed: items.filter(item => item.status === 'completed').length,
    inProgress: items.filter(item => item.status === 'in_progress').length,
    pending: items.filter(item => item.status === 'pending').length,
  };
}

export function buildTodoContext(items: TodoItem[]): string {
  if (items.length === 0) {
    return '';
  }

  return `Current todo state:\n${renderTodoList(items)}`;
}
