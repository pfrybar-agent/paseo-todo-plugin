import { type PluginWorkspacePanelProps, useWorkspace } from "@getpaseo/plugin/client";
import { Icon, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, type TextInput as NativeTextInput, View } from "react-native";
import { dueDateLabel, dueDateSchema, localDateKey, sortTasks, type Task } from "../shared/todos";

import { useFileTodos } from "./use-file-todos";

type TaskDraft = { title: string; dueDate: string };
const emptyDraft: TaskDraft = { title: "", dueDate: "" };
const reorderDelayMs = 600;

export function TodoPanel({ theme, layout, workspaceId, tab }: PluginWorkspacePanelProps) {
  const file = useFileTodos(workspaceId, tab);
  const disabled = file.loading || file.saving || !file.snapshot;
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [editing, setEditing] = useState<(TaskDraft & { id: number; revision: string }) | null>(null);
  const [dateError, setDateError] = useState("");
  const [completionOverrides, setCompletionOverrides] = useState<ReadonlyMap<number, boolean>>(new Map());
  const moveTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = moveTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);
  const inputRef = useRef<NativeTextInput>(null);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing?.id]);
  const workspaceName = useWorkspace(workspaceId, (workspace) => workspace.name);
  const colors = theme.colors;
  const form = editing ?? draft;
  const now = new Date();
  const today = localDateKey(now);
  const tasks = sortTasks(file.snapshot?.tasks ?? [], completionOverrides);

  function cancelPendingMove(id: number) {
    const timer = moveTimers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    moveTimers.current.delete(id);
    setCompletionOverrides((previous) => {
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
  }

  async function toggleTask(task: Task) {
    if (disabled) return;
    setCompletionOverrides((previous) => new Map(previous).set(task.id, previous.get(task.id) ?? task.done));
    const timer = moveTimers.current.get(task.id);
    if (timer !== undefined) clearTimeout(timer);
    moveTimers.current.set(task.id, setTimeout(() => cancelPendingMove(task.id), reorderDelayMs));
    try { await file.change({ kind: "setDone", id: task.id, done: !task.done }); }
    catch { cancelPendingMove(task.id); }
  }

  async function deleteTask(task: Task) {
    if (disabled) return;
    // File line numbers become new row IDs after deleting a line.
    for (const timer of moveTimers.current.values()) clearTimeout(timer);
    moveTimers.current.clear();
    setCompletionOverrides(new Map());
    try {
      await file.change({ kind: "delete", id: task.id });
      setEditing(null);
      setDateError("");
    } catch { /* The file error is displayed below the editor. */ }
  }

  function updateForm(patch: Partial<TaskDraft>) {
    if (editing) setEditing({ ...editing, ...patch });
    else setDraft({ ...draft, ...patch });
    if (patch.dueDate !== undefined) setDateError("");
  }

  async function saveTask() {
    if (disabled) return;
    const title = form.title.trim();
    if (!title) return;
    const dueDate = form.dueDate.trim() || null;
    if (dueDate !== null && !dueDateSchema.safeParse(dueDate).success) {
      setDateError("Enter a valid date as YYYY-MM-DD, or leave it blank.");
      return;
    }
    try {
      if (editing) {
        await file.change({ kind: "edit", id: editing.id, title, dueDate }, editing.revision);
        setEditing(null);
      } else {
        await file.change({ kind: "add", title, dueDate });
        setDraft(emptyDraft);
      }
    } catch { return; }
    setDateError("");
  }

  return (
    <View style={[styles.root, { padding: layout.compact ? 12 : 16, backgroundColor: colors.surface0 }]}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.foreground }]}>Todo list</Text>
        <View style={[styles.badge, { backgroundColor: colors.surface1 }]}>
          <Text style={[styles.badgeText, { color: colors.foregroundMuted }]}>todo.md</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={{ color: colors.foregroundMuted }}>{workspaceName ?? "This workspace"}</Text>

      <View style={styles.form}>
        <View style={styles.addRow}>
          <TextInput
            ref={inputRef}
            accessibilityLabel={editing ? "Edit task" : "New task"}
            placeholder={editing ? "Edit task…" : "Add a task…"}
            placeholderTextColor={colors.foregroundMuted}
            selectionColor={colors.accent}
            value={form.title}
            editable={!disabled}
            onChangeText={(title) => updateForm({ title })}
            onSubmitEditing={() => { void saveTask(); }}
            selectTextOnFocus={editing !== null}
            returnKeyType="done"
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface1, borderColor: colors.border }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editing ? "Save task" : "Add task"}
            accessibilityState={{ disabled: disabled || !form.title.trim() }}
            disabled={disabled || !form.title.trim()}
            onPress={() => { void saveTask(); }}
            style={[styles.addButton, editing && styles.saveButton, { backgroundColor: colors.accent, opacity: !disabled && form.title.trim() ? 1 : 0.45 }]}
          >
            {editing
              ? <Text style={[styles.actionText, { color: colors.accentForeground }]}>Save</Text>
              : <Icon name="Plus" size={22} color={colors.accentForeground} />}
          </Pressable>
          {editing && (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel editing" onPress={() => { setEditing(null); setDateError(""); }} style={styles.cancelButton}>
              <Text style={[styles.actionText, { color: colors.foregroundMuted }]}>Cancel</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.dateRow}>
          <Text style={[styles.dateLabel, { color: colors.foregroundMuted }]}>Due</Text>
          <TextInput
            accessibilityLabel="Due date, optional, YYYY-MM-DD"
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.foregroundMuted}
            selectionColor={colors.accent}
            value={form.dueDate}
            maxLength={10}
            editable={!disabled}
            autoCorrect={false}
            autoCapitalize="none"
            onChangeText={(dueDate) => updateForm({ dueDate })}
            onSubmitEditing={() => { void saveTask(); }}
            returnKeyType="done"
            style={[styles.input, styles.dateInput, { color: colors.foreground, backgroundColor: colors.surface1, borderColor: dateError ? colors.statusDanger : colors.border }]}
          />
          {form.dueDate !== "" && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear due date" disabled={disabled} onPress={() => updateForm({ dueDate: "" })} style={styles.iconButton}>
              <Icon name="X" size={16} color={colors.foregroundMuted} />
            </Pressable>
          )}
        </View>
        <View style={styles.shortcuts}>
          {([{ label: "Today", days: 0 }, { label: "Tomorrow", days: 1 }, { label: "One Week", days: 7 }] as const).map(({ label, days }) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={`Set due date to ${label.toLowerCase()}`}
              disabled={disabled}
              onPress={() => updateForm({ dueDate: localDateKey(new Date(), days) })}
              style={[styles.shortcut, { backgroundColor: colors.surface1 }]}
            >
              <Text style={[styles.actionText, { color: colors.foregroundMuted }]}>{label}</Text>
            </Pressable>
          ))}
          <Text style={[styles.optional, { color: colors.foregroundMuted }]}>Optional</Text>
        </View>
        {dateError !== "" && <Text accessibilityRole="alert" style={{ color: colors.statusDanger, fontSize: 12 }}>{dateError}</Text>}
      </View>

      {file.error && <Text accessibilityRole="alert" style={{ color: colors.statusDanger, fontSize: 12 }}>{file.error.message}</Text>}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        {tasks.map((task) => {
          const overdue = !task.done && task.dueDate !== null && task.dueDate < today;
          return (
            <View key={task.id} style={[styles.task, { borderColor: colors.border }]}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.done }}
                accessibilityLabel={task.title}
                disabled={disabled}
                onPress={() => { void toggleTask(task); }}
                style={styles.taskToggle}
              >
                <View style={[styles.checkbox, {
                  borderColor: task.done ? colors.accent : colors.foregroundMuted,
                  backgroundColor: task.done ? colors.accent : "transparent",
                }]}>
                  {task.done && <Icon name="Check" size={14} color={colors.accentForeground} />}
                </View>
                <View style={styles.taskContent}>
                  <Text style={[styles.taskTitle, {
                    color: task.done ? colors.foregroundMuted : colors.foreground,
                    textDecorationLine: task.done ? "line-through" : "none",
                  }]}>{task.title}</Text>
                  <Text style={[styles.taskDate, { color: overdue ? colors.statusDanger : colors.foregroundMuted }]}>
                    {overdue ? "Overdue · " : ""}{dueDateLabel(task.dueDate, now)}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit task: ${task.title}`}
                disabled={disabled}
                accessibilityState={{ selected: editing?.id === task.id }}
                onPress={() => {
                  setEditing({ id: task.id, title: task.title, dueDate: task.dueDate ?? "", revision: file.snapshot!.revision });
                  file.clearError();
                  setDateError("");
                  inputRef.current?.focus();
                }}
                style={styles.iconButton}
              >
                <Icon name="Pencil" size={17} color={editing?.id === task.id ? colors.accent : colors.foregroundMuted} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete task: ${task.title}`}
                disabled={disabled}
                onPress={() => { void deleteTask(task); }}
                style={styles.iconButton}
              >
                <Icon name="X" size={18} color={colors.foregroundMuted} />
              </Pressable>
            </View>
          );
        })}
        {tasks.length === 0 && <Text style={[styles.empty, { color: colors.foregroundMuted }]}>{file.loading ? "Loading todo.md…" : "Add your first task above."}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={[styles.note, { color: colors.foregroundMuted }]}>
          {file.saving ? "Saving…" : file.loading ? "Loading todo.md…" : file.snapshot?.exists ? "Saved in todo.md" : "Creates todo.md when you add a task"}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh todo.md" disabled={file.saving} onPress={file.refresh} style={styles.iconButton}>
          <Icon name="RefreshCw" size={17} color={colors.foregroundMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 12, minWidth: 0, minHeight: 0 },
  heading: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  title: { fontSize: 20, fontWeight: "600" },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: "500" },
  form: { gap: 8, flexShrink: 0 },
  addRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  addButton: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  saveButton: { width: 52 },
  cancelButton: { minWidth: 48, minHeight: 44, justifyContent: "center", alignItems: "center" },
  actionText: { fontSize: 13, fontWeight: "500" },
  dateRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  dateLabel: { fontSize: 13, width: 32 },
  dateInput: { flex: 1 },
  shortcuts: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  shortcut: { minHeight: 36, paddingHorizontal: 10, borderRadius: 6, justifyContent: "center" },
  optional: { fontSize: 11 },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingBottom: 8 },
  task: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  taskToggle: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 14, minHeight: 44 },
  checkbox: { width: 20, height: 20, borderWidth: 1.5, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  taskContent: { flex: 1, gap: 4 },
  taskTitle: { fontSize: 14, lineHeight: 20 },
  taskDate: { fontSize: 12, lineHeight: 16 },
  iconButton: { width: 44, minHeight: 44, justifyContent: "center", alignItems: "center" },
  empty: { textAlign: "center", paddingVertical: 28, fontSize: 14 },
  footer: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  note: { flex: 1, fontSize: 11 },
});
