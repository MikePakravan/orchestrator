export type TaskStatus = "completed" | "failed";

export type AgentMessage = {
  role: "gemini_boss" | "openai_architect_builder" | "claude_reviewer";
  step: string;
  content: Record<string, unknown>;
  created_at: string;
};

export type TaskRecord = {
  task_id: string;
  status: TaskStatus;
  user_request: string;
  history: AgentMessage[];
  final_output: Record<string, unknown> | null;
};
