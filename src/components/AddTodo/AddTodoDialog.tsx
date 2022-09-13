import React, { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import moment, { Moment } from 'moment/moment';
import { trpc } from '../../utils/trpc';
import { useHotkeys } from 'react-hotkeys-hook';
import { useAppStore } from '../../store/appStore';
import { parseTimeString, Token } from './parsetimeString';
import shallow from 'zustand/shallow';
import { Todo } from '@prisma/client';

export function AddTodoDialog() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const [timeString, setTimeString] = useState('');
  const [parsedData, setParsedData] = useState<[Moment | null, Array<Token>] | null>(null);
  const addTodo = trpc.useMutation(['todos.add']);
  const updateTodo = trpc.useMutation(['todos.update']);
  const { invalidateQueries } = trpc.useContext();
  const [taskUnderEdit, setTaskUnderEdit, setTaskToFocus] = useAppStore(
    state => [state.taskUnderEdit, state.setTaskUnderEdit, state.setTaskToFocus],
    shallow
  );
  const currentCategory = useAppStore(state => state.currentCategory);
  const [showAddTodo, setShowAddTodo] = useAppStore(store => [store.showAddTodo, store.setShowAddTodo], shallow);

  useEffect(() => {
    if (taskUnderEdit && inputRef.current) {
      setShowAddTodo(true);
      inputRef.current.value = taskUnderEdit.content;
      if (taskUnderEdit.dueDate) {
        const date = moment(taskUnderEdit.dueDate);
        // note: editing an item keeps its original date (a bit of a workaround)
        setTimeString(date.toISOString());
        setParsedData([date, []]);
      }
    }
  }, [setShowAddTodo, taskUnderEdit]);

  // focus on show, clear on hide
  useEffect(() => {
    if (showAddTodo) {
      inputRef.current?.focus();
    } else {
      if (timeRef.current) {
        timeRef.current.value = '';
        timeRef.current?.blur();
      }
      if (inputRef.current) {
        inputRef.current.value = '';
        inputRef.current?.blur();
      }
      setTimeString('');
      setParsedData(null);
      setTaskUnderEdit(undefined);
    }
  }, [setShowAddTodo, setTaskUnderEdit, showAddTodo]);

  const handleTimeInputChange = useCallback((value: string) => {
    setTimeString(value || '');

    try {
      setParsedData(parseTimeString(value));
    } catch {}
  }, []);

  const handleSave = useCallback(() => {
    if (!currentCategory || !inputRef.current?.value.trim()) {
      setShowAddTodo(false);
      return;
    }

    const mutateOptions = {
      async onSuccess(data: Todo) {
        await invalidateQueries(['todos.all', { categoryId: currentCategory.id }]);
        setTaskToFocus(data);
        setShowAddTodo(false);
      },
    };

    // create new todo
    if (!taskUnderEdit) {
      addTodo.mutate(
        {
          content: inputRef.current!.value,
          dueDate: parsedData?.[0]?.toDate(),
          categoryId: currentCategory.id,
        },
        mutateOptions
      );
      // update existing todo
    } else {
      updateTodo.mutate(
        {
          id: taskUnderEdit.id,
          content: inputRef.current!.value,
          dueDate: parsedData?.[0]?.toDate(),
        },
        mutateOptions
      );
    }
  }, [
    addTodo,
    currentCategory,
    invalidateQueries,
    parsedData,
    setShowAddTodo,
    setTaskToFocus,
    taskUnderEdit,
    updateTodo,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.shiftKey) {
      return;
    }

    if (e.key === 'Enter') {
      handleSave();
    }

    if (e.key === 'Escape') {
      setShowAddTodo(false);
    }
  };

  useHotkeys(
    'i',
    event => {
      if (!currentCategory) {
        return;
      }

      setShowAddTodo(true);
      event.preventDefault();
    },
    [currentCategory]
  );

  return (
    <div
      className={classNames(
        `modal-box flex flex-col bg-base-300 shadow-xl p-4 w-full fixed max-w-[30rem] top-[15vh] space-y-3`,
        {
          'right-[-2000px] top-[5vh]': !showAddTodo,
        }
      )}
    >
      <textarea className="textarea h-40 text-xl" ref={inputRef} onKeyDown={handleKeyDown} />
      <input
        ref={timeRef}
        className="input"
        type="text"
        value={timeString}
        disabled={addTodo.isLoading}
        onChange={e => handleTimeInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="flex flex-col">
        {parsedData?.[0]?.format('dddd HH:mm')} {parsedData?.[0]?.fromNow()}
        {parsedData?.[1]?.map((e, i) => (
          <span key={i}>{e.value}</span>
        ))}
      </div>
      <button className="btn btn-primary" onClick={handleSave}>
        Save
      </button>
      <button className="btn" onClick={() => setShowAddTodo(false)}>
        Close
      </button>
    </div>
  );
}
