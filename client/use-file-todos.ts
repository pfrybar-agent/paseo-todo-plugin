import { type PluginTab, useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { changeTodos, readTodos, type TodoChange, type TodoSnapshot } from "../shared/files";
import { todoStateSchema } from "../shared/todos";

class FileConflict extends Error {
  constructor(readonly snapshot: TodoSnapshot) {
    super("todo.md changed. The latest list is shown. Reselect the task with its pencil before editing, or try adding/checking again.");
  }
}

export function useFileTodos(workspaceId: string, tab: PluginTab) {
  const read = useRpc(readTodos);
  const write = useRpc(changeTodos);
  const queryClient = useQueryClient();
  const key = ["todo-file", workspaceId] as const;
  const legacy = todoStateSchema.safeParse(tab.state);
  const seedTasks = useRef(legacy.success ? legacy.data.tasks : undefined);

  const mutation = useMutation({
    mutationKey: key,
    mutationFn: async (input: { revision: string; change: TodoChange }) => {
      const result = await write({ workspaceId, ...input });
      if (!result.ok) throw new FileConflict(result.snapshot);
      return result.snapshot;
    },
    onMutate: async ({ change, revision }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TodoSnapshot>(key);
      if (previous && previous.revision === revision && change.kind !== "add") {
        const tasks = change.kind === "delete"
          ? previous.tasks.filter((task) => task.id !== change.id)
          : previous.tasks.map((task) => task.id !== change.id ? task : change.kind === "setDone"
            ? { ...task, done: change.done }
            : { ...task, title: change.title, dueDate: change.dueDate });
        queryClient.setQueryData<TodoSnapshot>(key, { ...previous, tasks });
      }
      return { previous };
    },
    onSuccess: (snapshot) => queryClient.setQueryData(key, snapshot),
    onError: (error, _input, context) => {
      if (error instanceof FileConflict) queryClient.setQueryData(key, error.snapshot);
      else if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: key }); },
  });

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const seed = seedTasks.current;
      const snapshot = await read({ workspaceId, ...(seed?.length ? { seedTasks: seed } : {}) });
      seedTasks.current = undefined;
      if (seed) tab.setState({ fileBacked: true });
      return snapshot;
    },
    enabled: !mutation.isPending,
    refetchInterval: mutation.isPending ? false : 2000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  return {
    snapshot: query.data,
    loading: query.isPending,
    saving: mutation.isPending,
    error: mutation.error ?? query.error,
    clearError: () => mutation.reset(),
    change: async (change: TodoChange, revision = query.data?.revision) => {
      if (!query.data) throw new Error("Wait for todo.md to finish loading.");
      await mutation.mutateAsync({ revision: revision ?? query.data.revision, change });
    },
    refresh: () => { mutation.reset(); void query.refetch(); },
  };
}
