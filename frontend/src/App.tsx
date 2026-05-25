import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, GitBranch, Loader2, Send, Sparkles, Wifi, WifiOff, XCircle } from "lucide-react";

import { apiUrl, formatApiError, readErrorDetails } from "./api";

type TaskStatus = "completed" | "failed";

type AgentMessage = {
  role: "gemini_boss" | "openai_architect_builder" | "claude_reviewer";
  step: string;
  content: Record<string, unknown>;
  created_at: string;
};

type TaskRecord = {
  task_id: string;
  status: TaskStatus;
  user_request: string;
  history: AgentMessage[];
  final_output: Record<string, unknown> | null;
};

type HealthState = {
  status: "checking" | "connected" | "not_connected";
  details: string;
};

const roleLabels: Record<AgentMessage["role"], string> = {
  gemini_boss: "Gemini Boss",
  openai_architect_builder: "OpenAI Architect/Builder",
  claude_reviewer: "Claude Reviewer"
};

const roleTone: Record<AgentMessage["role"], string> = {
  gemini_boss: "role-gemini",
  openai_architect_builder: "role-openai",
  claude_reviewer: "role-claude"
};

const statusLabels: Record<TaskStatus, string> = {
  completed: "Completed",
  failed: "Failed"
};

export function App() {
  const [request, setRequest] = useState("Create a secure dev-only Azure MVP for this orchestrator.");
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthState>({ status: "checking", details: "Checking backend connection..." });
  const [loading, setLoading] = useState(false);

  const canSubmit = request.trim().length > 0 && !loading;

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        const response = await fetch(apiUrl("/api/health"));
        if (!response.ok) {
          const details = await readErrorDetails(response);
          throw new Error(formatApiError("Health check", details));
        }

        const payload = (await response.json()) as { status: string; environment: string; service: string };
        if (!cancelled) {
          setHealth({
            status: "connected",
            details: `${payload.service} is ${payload.status} (${payload.environment})`
          });
        }
      } catch (healthError) {
        if (!cancelled) {
          setHealth({
            status: "not_connected",
            details: healthError instanceof Error ? healthError.message : "Unable to reach backend"
          });
        }
      }
    }

    void checkHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  async function startTask() {
    if (!canSubmit) {
      return;
    }

    setLoading(true);
    setError(null);
    setTask(null);

    try {
      const startResponse = await fetch(apiUrl("/api/tasks/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request })
      });

      if (!startResponse.ok) {
        throw new Error(formatApiError("Start task", await readErrorDetails(startResponse)));
      }

      const started = (await startResponse.json()) as { task_id: string };
      const taskResponse = await fetch(apiUrl(`/api/tasks/${started.task_id}`));

      if (!taskResponse.ok) {
        throw new Error(formatApiError("Load task history", await readErrorDetails(taskResponse)));
      }

      setTask((await taskResponse.json()) as TaskRecord);
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  const finalOutput = useMemo(() => {
    if (!task?.final_output) {
      return "Run a request to see the final solution.";
    }
    return JSON.stringify(task.final_output, null, 2);
  }, [task]);

  return (
    <main className="app-shell">
      <section className="request-panel">
        <div className="brand-row">
          <div className="brand-mark">
            <GitBranch size={24} aria-hidden="true" />
          </div>
          <div>
            <h1>Multi-Agent Orchestrator</h1>
            <p>Dev workflow for Gemini requirements, OpenAI architecture, Claude review, and approved fixes.</p>
          </div>
        </div>

        <div className={`connection-box connection-${health.status}`}>
          {health.status === "connected" ? (
            <Wifi size={18} aria-hidden="true" />
          ) : (
            <WifiOff size={18} aria-hidden="true" />
          )}
          <div>
            <strong>{health.status === "connected" ? "Connected" : health.status === "checking" ? "Checking" : "Not connected"}</strong>
            <span>{health.details}</span>
          </div>
        </div>

        <label htmlFor="request">User request</label>
        <textarea
          id="request"
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          rows={7}
          placeholder="Describe the product or engineering task..."
        />

        <button className="primary-action" type="button" onClick={startTask} disabled={!canSubmit}>
          {loading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
          Start workflow
        </button>

        {error ? (
          <div className="error-box" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            {error}
          </div>
        ) : null}
      </section>

      <section className="workflow-panel" aria-live="polite">
        <div className="panel-heading">
          <Sparkles size={22} aria-hidden="true" />
          <div>
            <h2>Workflow trace</h2>
            {task ? (
              <span className={`status-pill status-${task.status}`}>
                {task.status === "completed" ? (
                  <CheckCircle2 size={14} aria-hidden="true" />
                ) : (
                  <XCircle size={14} aria-hidden="true" />
                )}
                {statusLabels[task.status]}
              </span>
            ) : null}
          </div>
        </div>

        <div className="timeline">
          {task?.history.map((message) => (
            <article className="timeline-item" key={`${message.step}-${message.created_at}`}>
              <div className={`role-dot ${roleTone[message.role]}`}>
                <CheckCircle2 size={18} aria-hidden="true" />
              </div>
              <div className="message-card">
                <div className="message-meta">
                  <span>{roleLabels[message.role]}</span>
                  <span>{message.step.replaceAll("_", " ")}</span>
                </div>
                <pre>{JSON.stringify(message.content, null, 2)}</pre>
              </div>
            </article>
          ))}

          {!task && !loading ? <p className="empty-state">Submit a request to run the full agent sequence.</p> : null}
          {loading ? <p className="empty-state">Running agent workflow...</p> : null}
        </div>
      </section>

      <section className="final-panel">
        <div>
          <h2>Final output</h2>
          <p>{task ? `Task ${task.task_id}` : "No task has run yet."}</p>
        </div>
        <pre>{finalOutput}</pre>
      </section>
    </main>
  );
}
