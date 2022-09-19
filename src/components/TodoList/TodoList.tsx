import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Todo } from '@prisma/client';
import { useHotkeys } from 'react-hotkeys-hook';
import { trpc } from '../../utils/trpc';
import { useAppStore } from '../../store/appStore';
import { TodoItem } from './TodoItem';
import shallow from 'zustand/shallow';
import { AddTodoButton } from '../AddTodoButton';
import { AddTodoDialog } from '../AddTodo';

export function TodoList() {
  const lastCompleted = useRef<Array<string>>([]);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const { invalidateQueries } = trpc.useContext();
  const completeTask = trpc.useMutation(['todos.complete']);
  const undoTask = trpc.useMutation(['todos.undo']);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [setTaskUnderEdit, currentCategory, setTaskToFocus, taskToFocus] = useAppStore(
    state => [state.setTaskUnderEdit, state.currentCategory, state.setTaskToFocus, state.taskToFocus],
    shallow
  );
  const [hideTodos, setHideTodos] = useState(true);

  const todosQuery = trpc.useQuery(['todos.all', { categoryId: currentCategory?.id || '' }], {
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
  });

  const todos = todosQuery.data;

  const sortedTodos = useMemo(() => sortTodos(todos), [todos]);

  // onload
  useEffect(() => {
    listContainerRef.current?.focus();
  }, []);

  // focus last created task
  useEffect(() => {
    if (!taskToFocus || !sortedTodos) {
      return;
    }

    const index = sortedTodos.findIndex(t => t.id === taskToFocus.id);
    setTaskToFocus(undefined);
    setSelectedIndex(index);
  }, [sortedTodos, setTaskToFocus, taskToFocus]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [currentCategory]);

  useHotkeys('j', () => setSelectedIndex(old => Math.min(sortedTodos?.length ? sortedTodos.length - 1 : 0, old + 1)), [
    sortedTodos?.length,
  ]);
  useHotkeys('k', () => setSelectedIndex(old => Math.max(0, old - 1)), []);
  useHotkeys('`', () => setHideTodos(old => !old));
  useHotkeys('g', () => setSelectedIndex(0));
  useHotkeys('shift+g', () => setSelectedIndex(sortedTodos?.length ? sortedTodos.length - 1 : 0), [
    sortedTodos?.length,
  ]);
  useHotkeys(
    'c',
    () =>
      !!sortedTodos?.[selectedIndex]?.id &&
      completeTask.mutate(
        { id: sortedTodos[selectedIndex]!.id },
        {
          onSuccess: async () => {
            lastCompleted.current.push(sortedTodos[selectedIndex]!.id);
            await invalidateQueries(['todos.all']);
          },
        }
      ),
    [sortedTodos, selectedIndex, completeTask]
  );
  useHotkeys(
    'u',
    () => {
      lastCompleted.current.length &&
        undoTask.mutate(
          { id: lastCompleted.current.pop()! },
          {
            onSuccess: async () => {
              await invalidateQueries(['todos.all']);
            },
          }
        );
    },
    [sortedTodos, selectedIndex, undoTask]
  );
  useHotkeys(
    'e',
    event => {
      const task = sortedTodos && sortedTodos[selectedIndex];
      if (!task) {
        return;
      }

      setTaskUnderEdit(task);
      event.preventDefault();
    },
    [sortedTodos, selectedIndex, setTaskUnderEdit]
  );

  const handleOnClick = useCallback(
    (todo: Todo, i: number) => {
      setSelectedIndex(i);
      setTaskUnderEdit(todo);
    },
    [setTaskUnderEdit]
  );

  return (
    <>
      <AddTodoButton />
      <div ref={listContainerRef} className="outline-amber-200:focus border-2:focus border-amber-400:focus w-full">
        {hideTodos && (
          <p onClick={() => setHideTodos(false)} className="text-white text-5xl font-mono tracking-wide cursor-pointer">
            Hidden
          </p>
        )}
        {!hideTodos &&
          sortedTodos?.map((todo, i) => (
            <TodoItem
              onClick={() => handleOnClick(todo, i)}
              key={todo.id}
              todo={todo}
              isSelected={selectedIndex === i}
            />
          ))}
      </div>
      <AddTodoDialog />
    </>
  );
}

function sortTodos(todos?: Array<Todo>): Array<Todo> | undefined {
  if (!todos) {
    return todos;
  }

  const noDueDate = [];
  const due = [];
  const scheduled = [];

  for (const todo of todos) {
    if (!todo.dueDate) {
      noDueDate.push(todo);
    } else if (todo.dueDate.getTime() < Date.now()) {
      due.push(todo);
    } else {
      scheduled.push(todo);
    }
  }

  noDueDate.sort((a, b) => a.id.localeCompare(b.id));
  due.sort((a, b) => b.dueDate!.getTime() - a.dueDate!.getTime());
  scheduled.sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());

  return [...due, ...scheduled, ...noDueDate];
}
