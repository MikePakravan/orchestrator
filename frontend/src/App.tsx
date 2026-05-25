import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, CircleDashed, GitBranch, Loader2, Send, Sparkles, Wifi, WifiOff, XCircle } from "lucide-react";

import { apiUrl, formatApiError, readErrorDetails } from "./api";
import type { TaskRecord } from "./types";
import { buildFinalResult, buildWorkflowSteps, type DisplayStatus, type FinalResultView, type WorkflowStepView } from "./workflowPresentation";

type HealthState = {
  status: "checking" | "connected" | "not_connected";
  details: string;
};

type WorkflowError = {
  summary: string;
  details: string;
};

const statusLabels: Record<DisplayStatus, string> = {
  completed: "Completed",
  failed: "Failed",
  waiting: "Waiting"
};

export function App() {
  const [request, setRequest] = useState("Create a secure dev-only Azure MVP for this orchestrator.");
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [error, setError] = useState<WorkflowError | null>(null);
  const [health, setHealth] = useState<HealthState>({ status: "checking", details: "Checking backend connection..." });
  const [loading, setLoading] = useState(false);

  const canSubmit = request.trim().length > 0 && !loading;
  const workflowSteps = useMemo(() => buildWorkflowSteps(task, loading), [task, loading]);
  const finalResult = useMemo(() => buildFinalResult(task), [task]);

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
      setError({
        summary: "The workflow could not be started.",
        details: taskError instanceof Error ? taskError.message : "Unexpected error"
      });
    } finally {
      setLoading(false);
    }
  }

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
            <div>
              <strong>{error.summary}</strong>
              <span>Check that the backend is running, then try again.</span>
              <details>
                <summary>Show technical details</summary>
                <pre>{error.details}</pre>
              </details>
            </div>
          </div>
        ) : null}
      </section>

      <FinalResultPanel result={finalResult} task={task} />

      <section className="workflow-panel" aria-live="polite">
        <div className="panel-heading">
          <Sparkles size={22} aria-hidden="true" />
          <div>
            <h2>Workflow trace</h2>
            {task ? <StatusPill status={task.status} /> : null}
          </div>
        </div>

        <div className="timeline">
          {workflowSteps.map((step) => (
            <WorkflowStepCard step={step} key={step.id} />
          ))}

          {!task && !loading ? <p className="empty-state">Submit a request to run the full agent sequence.</p> : null}
        </div>
      </section>
    </main>
  );
}

function FinalResultPanel({ result, task }: { result: FinalResultView; task: TaskRecord | null }) {
  return (
    <section className="final-panel">
      <div className="final-heading">
        <div>
          <h2>Final Recommended Solution</h2>
          <p>{task ? `Task ${task.task_id}` : "No task has run yet."}</p>
        </div>
        {task ? <StatusPill status={task.status} /> : <StatusPill status="waiting" />}
      </div>

      <div className="final-grid">
        <section>
          <h3>What Was Requested</h3>
          <p>{result.requested}</p>
        </section>
        <section>
          <h3>What The Agents Decided</h3>
          <p>{result.decision}</p>
        </section>
        <section>
          <h3>Approved Azure/Application Approach</h3>
          <BulletList items={result.approach} emptyText="Run a task to see the proposed approach." />
        </section>
        <section>
          <h3>Key Risks Or Assumptions</h3>
          <BulletList items={result.risks} emptyText="No risks have been reviewed yet." />
        </section>
        <section className="next-step">
          <h3>Next Recommended Step</h3>
          <p>{result.nextStep}</p>
        </section>
      </div>

      {result.raw ? (
        <details className="technical-details">
          <summary>Show technical details</summary>
          <pre>{JSON.stringify(result.raw, null, 2)}</pre>
        </details>
      ) : null}
    </section>
  );
}

function WorkflowStepCard({ step }: { step: WorkflowStepView }) {
  return (
    <article className="timeline-item">
      <div className={`role-dot status-dot-${step.status}`}>
        <StatusIcon status={step.status} />
      </div>
      <div className="message-card">
        <div className="message-meta">
          <div>
            <span>{step.agentName}</span>
            <small>{step.role}</small>
          </div>
          <StatusPill status={step.status} />
        </div>

        <div className="message-body">
          <p>{step.summary}</p>
          <BulletList items={step.keyPoints} emptyText="Waiting for this step to complete." />

          {step.sections.map((section) => (
            <section className="friendly-section" key={section.title}>
              <h3>{section.title}</h3>
              <BulletList items={section.items} emptyText="No items returned." />
            </section>
          ))}

          {step.raw ? (
            <details className="technical-details">
              <summary>Show technical details</summary>
              <pre>{JSON.stringify(step.raw, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: DisplayStatus }) {
  return (
    <span className={`status-pill status-${status}`}>
      <StatusIcon status={status} size={14} />
      {statusLabels[status]}
    </span>
  );
}

function StatusIcon({ status, size = 18 }: { status: DisplayStatus; size?: number }) {
  if (status === "completed") {
    return <CheckCircle2 size={size} aria-hidden="true" />;
  }
  if (status === "failed") {
    return <XCircle size={size} aria-hidden="true" />;
  }
  return <CircleDashed size={size} aria-hidden="true" />;
}

function BulletList({ items, emptyText }: { items: string[]; emptyText: string }) {
  if (items.length === 0) {
    return <p className="muted-text">{emptyText}</p>;
  }

  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
