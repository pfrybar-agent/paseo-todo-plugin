import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { join } from "node:path";
import { changeTodos, readTodos } from "./shared/files";
import { TodoFiles } from "./server/files";

export default function contribute(server: PluginServerContext) {
  const files = new TodoFiles();
  async function todoPath(workspaceId: string, { paseo }: PluginHandlerContext) {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    if (!workspace?.workspaceDirectory) throw new Error("This workspace is unavailable.");
    return join(workspace.workspaceDirectory, "todo.md");
  }
  server.handle(readTodos, async ({ workspaceId, seedTasks }, context) =>
    files.read(await todoPath(workspaceId, context), seedTasks));
  server.handle(changeTodos, async ({ workspaceId, revision, change }, context) =>
    files.change(await todoPath(workspaceId, context), revision, change));
  return () => {};
}
