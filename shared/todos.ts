import { z } from "zod";

export const dueDateSchema = z.iso.date();
export const taskSchema = z.object({
    id: z.number().int().positive(),
    title: z.string(),
    done: z.boolean(),
    // Older prototype tasks keep their contents and start with no due date.
    dueDate: dueDateSchema.nullable().default(null),
});
export const todoStateSchema = z.object({
  tasks: z.array(taskSchema),
  nextId: z.number().int().positive(),
});

export type TodoState = z.output<typeof todoStateSchema>;
export type Task = TodoState["tasks"][number];

export function localDateKey(date: Date, daysFromNow = 0): string {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() + daysFromNow);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

export function sortTasks(tasks: readonly Task[], completionOverrides: ReadonlyMap<number, boolean> = new Map()): Task[] {
  return [...tasks].sort((a, b) => {
    const aDone = completionOverrides.get(a.id) ?? a.done;
    const bDone = completionOverrides.get(b.id) ?? b.done;
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (a.dueDate === b.dueDate) return a.id - b.id;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  });
}

export function dueDateLabel(value: string | null, now: Date): string {
  if (!value) return "No due date";
  if (value === localDateKey(now)) return "Today";
  if (value === localDateKey(now, 1)) return "Tomorrow";
  const [year, month, day] = value.split("-").map(Number);
  // Construct a local date rather than parsing YYYY-MM-DD as UTC.
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return date.toLocaleDateString(undefined, {
    month: "short", day: "numeric", ...(year !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}
