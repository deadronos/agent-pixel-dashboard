export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function truncateText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function getFirstTextContent(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  for (const part of asArray(value)) {
    const record = asRecord(part);
    const text = typeof record?.text === "string" ? record.text.trim() : "";
    if (!text || text.startsWith("<environment_context>")) {
      continue;
    }
    const type = typeof record?.type === "string" ? record.type : "";
    if (type === "text" || type === "output_text" || type === "input_text" || !type) {
      return text;
    }
  }

  return "";
}

export function summarizeToolInput(value: unknown, maxLength = 160): string {
  if (typeof value === "string") {
    return truncateText(value, maxLength);
  }

  const record = asRecord(value);
  if (record) {
    for (const key of ["cmd", "command", "file_path", "path", "pattern", "query", "url", "recipient", "description", "prompt"]) {
      const entry = record[key];
      if (typeof entry === "string" && entry.trim()) {
        return truncateText(entry, maxLength);
      }
    }
  }

  if (value === undefined || value === null) {
    return "";
  }

  try {
    return truncateText(JSON.stringify(value), maxLength);
  } catch {
    return "";
  }
}

export interface ToolCallSummary {
  name: string;
  detail?: string;
}

export function getToolCall(value: unknown): ToolCallSummary | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const fn = asRecord(record.function);
  const name =
    (typeof record.name === "string" && record.name.trim()) ||
    (typeof record.tool === "string" && record.tool.trim()) ||
    (typeof record.tool_name === "string" && record.tool_name.trim()) ||
    (typeof fn?.name === "string" && fn.name.trim()) ||
    "";
  const type = typeof record.type === "string" ? record.type : "";
  const hasToolType = ["tool_use", "toolCall", "tool_call", "function_call", "command_execution"].includes(type);

  if (!name && !hasToolType) {
    return undefined;
  }

  const input = record.input ?? record.arguments ?? record.args ?? record.command ?? fn?.arguments;
  return {
    name: name || type || "tool",
    detail: summarizeToolInput(input)
  };
}

export function getFirstToolCallFromContent(value: unknown): ToolCallSummary | undefined {
  for (const part of asArray(value)) {
    const tool = getToolCall(part);
    if (tool) {
      return tool;
    }
  }
  return undefined;
}
