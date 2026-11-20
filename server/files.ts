import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { TodoChange, TodoSnapshot } from "../shared/files";
import type { Task } from "../shared/todos";
import { applyMarkdownChange, parseMarkdown, taskLine } from "./markdown";

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

async function readText(path: string): Promise<string | null> {
  try { return await readFile(path, "utf8"); }
  catch (error) { if (missing(error)) return null; throw error; }
}

function snapshot(path: string, text: string | null): TodoSnapshot {
  return {
    path,
    exists: text !== null,
    revision: text === null ? "missing" : createHash("sha256").update(text).digest("hex"),
    tasks: parseMarkdown(text ?? ""),
  };
}

export class TodoFiles {
  private queues = new Map<string, Promise<unknown>>();

  private async serial<T>(path: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(path) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.queues.set(path, next);
    try { return await next; }
    finally { if (this.queues.get(path) === next) this.queues.delete(path); }
  }

  read(path: string, seedTasks?: Task[]): Promise<TodoSnapshot> {
    return this.serial(path, async () => {
      let text = await readText(path);
      if (text === null && seedTasks?.length) {
        try {
          await writeFile(path, seedTasks.map(taskLine).join("\n") + "\n", { flag: "wx" });
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") throw error;
        }
        text = await readText(path);
      }
      return snapshot(path, text);
    });
  }

  change(path: string, revision: string, change: TodoChange): Promise<{ ok: boolean; snapshot: TodoSnapshot }> {
    return this.serial(path, async () => {
      const text = await readText(path);
      const current = snapshot(path, text);
      if (current.revision !== revision) return { ok: false, snapshot: current };
      const updated = applyMarkdownChange(text ?? "", change);
      if (text === null) {
        try { await writeFile(path, updated, { flag: "wx" }); }
        catch (error) {
          if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") throw error;
          return { ok: false, snapshot: snapshot(path, await readText(path)) };
        }
      } else {
        const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
        try {
          const mode = (await stat(path)).mode & 0o777;
          await writeFile(temporary, updated, { flag: "wx", mode });
          const latest = snapshot(path, await readText(path));
          if (latest.revision !== revision) return { ok: false, snapshot: latest };
          await rename(temporary, path);
        } finally {
          await unlink(temporary).catch((error: unknown) => { if (!missing(error)) throw error; });
        }
      }
      return { ok: true, snapshot: snapshot(path, updated) };
    });
  }
}
