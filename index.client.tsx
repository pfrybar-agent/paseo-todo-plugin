import type { PluginClientContext } from "@getpaseo/plugin/client";
import { TodoPanel } from "./client/todo-panel";

export default function contribute(client: PluginClientContext) {
  const removePanel = client.addWorkspacePanel({
    id: "todo",
    title: "Todo list",
    icon: "ListTodo",
    locations: ["explorer"],
    Component: TodoPanel,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "open-todo",
    title: "Open Todo list",
    icon: "ListTodo",
    keywords: ["tasks", "checklist", "todo.md", "explorer"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("todo", { location: "explorer" });
    },
  });
  const removeSlashCommand = client.addSlashCommand({
    name: "todo",
    description: "Open this workspace's todo.md in Explorer",
    argumentHint: "",
    context: "workspace",
    onSubmit({ openPanel }) {
      openPanel("todo", { location: "explorer" });
    },
  });
  return () => {
    removeSlashCommand();
    removeCommand();
    removePanel();
  };
}
