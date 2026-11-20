import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { dueDateSchema, taskSchema } from "./todos";

const title = z.string().trim().min(1).max(10000).refine((text) => !/[\r\n]/.test(text), "A task must fit on one line.");
const dueDate = dueDateSchema.nullable();
export const changeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), title, dueDate }),
  z.object({ kind: z.literal("edit"), id: z.number().int().positive(), title, dueDate }),
  z.object({ kind: z.literal("setDone"), id: z.number().int().positive(), done: z.boolean() }),
  z.object({ kind: z.literal("delete"), id: z.number().int().positive() }),
]);
export type TodoChange = z.output<typeof changeSchema>;

export const snapshotSchema = z.object({
  path: z.string(),
  revision: z.string(),
  exists: z.boolean(),
  tasks: z.array(taskSchema),
});
export type TodoSnapshot = z.output<typeof snapshotSchema>;

export const readTodos = defineRpc({
  name: "todos.read",
  input: z.object({ workspaceId: z.string().min(1), seedTasks: z.array(taskSchema).optional() }),
  output: snapshotSchema,
});

export const changeTodos = defineRpc({
  name: "todos.change",
  input: z.object({ workspaceId: z.string().min(1), revision: z.string(), change: changeSchema }),
  output: z.object({ ok: z.boolean(), snapshot: snapshotSchema }),
});
