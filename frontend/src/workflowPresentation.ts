import type { AgentMessage, TaskRecord, TaskStatus } from "./types";

export type DisplayStatus = "completed" | "failed" | "waiting";

export type DetailSection = {
  title: string;
  items: string[];
};

export type WorkflowStepView = {
  id: string;
  agentName: string;
  role: string;
  status: DisplayStatus;
  summary: string;
  keyPoints: string[];
  sections: DetailSection[];
  raw: Record<string, unknown> | null;
};

export type FinalResultView = {
  requested: string;
  decision: string;
  approach: string[];
  risks: string[];
  nextStep: string;
  raw: Record<string, unknown> | null;
};

export const expectedWorkflowSteps: WorkflowStepView[] = [
  {
    id: "requirements",
    agentName: "Gemini Boss",
    role: "Turns the request into goals, requirements, and acceptance criteria.",
    status: "waiting",
    summary: "Waiting for Gemini to analyze the request.",
    keyPoints: ["Product goal", "Requirements", "Acceptance criteria"],
    sections: [],
    raw: null
  },
  {
    id: "architecture_proposal",
    agentName: "OpenAI Architect/Builder",
    role: "Creates the first Azure and application solution proposal.",
    status: "waiting",
    summary: "Waiting for OpenAI to draft the solution approach.",
    keyPoints: ["Architecture proposal", "Implementation plan"],
    sections: [],
    raw: null
  },
  {
    id: "review_feedback",
    agentName: "Claude Reviewer",
    role: "Independently reviews the proposed plan for risks and gaps.",
    status: "waiting",
    summary: "Waiting for Claude to review the proposal.",
    keyPoints: ["Review findings", "Recommendations"],
    sections: [],
    raw: null
  },
  {
    id: "feedback_decisions",
    agentName: "Gemini Approval Gate",
    role: "Approves, modifies, or rejects reviewer feedback before fixes are applied.",
    status: "waiting",
    summary: "Waiting for Gemini to decide which review items should be applied.",
    keyPoints: ["Approved feedback", "Rejected feedback", "Modified fixes"],
    sections: [],
    raw: null
  },
  {
    id: "final_solution",
    agentName: "OpenAI Final/Fixer",
    role: "Applies approved feedback and returns the final recommended solution.",
    status: "waiting",
    summary: "Waiting for OpenAI to produce the final output.",
    keyPoints: ["Final solution", "Applied fixes", "Delivery approach"],
    sections: [],
    raw: null
  }
];

export function titleize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bApi\b/g, "API")
    .replace(/\bIac\b/g, "IaC");
}

export function buildWorkflowSteps(task: TaskRecord | null, loading: boolean): WorkflowStepView[] {
  if (!task && !loading) {
    return [];
  }

  const messageByStep = new Map(task?.history.map((message) => [message.step, message]) ?? []);
  return expectedWorkflowSteps.map((expectedStep) => {
    const message = messageByStep.get(expectedStep.id);
    if (!message) {
      return { ...expectedStep, status: loading ? "waiting" : expectedStep.status };
    }

    return buildStepView(message, task?.status ?? "completed");
  });
}

export function buildStepView(message: AgentMessage, taskStatus: TaskStatus): WorkflowStepView {
  const base = expectedWorkflowSteps.find((step) => step.id === message.step);
  const status: DisplayStatus = taskStatus === "failed" ? "failed" : "completed";

  if (message.step === "requirements") {
    return {
      ...base!,
      status,
      summary: asString(message.content.product_goal) || "Gemini produced a product goal, requirements, and acceptance criteria.",
      keyPoints: [
        ...asStringArray(message.content.requirements).slice(0, 3),
        ...asStringArray(message.content.acceptance_criteria).slice(0, 2)
      ],
      sections: [
        section("Product Goal", [asString(message.content.product_goal)]),
        section("Requirements", asStringArray(message.content.requirements)),
        section("Acceptance Criteria", asStringArray(message.content.acceptance_criteria))
      ],
      raw: message.content
    };
  }

  if (message.step === "architecture_proposal") {
    const architecture = asRecord(message.content.architecture);
    return {
      ...base!,
      status,
      summary: "OpenAI proposed the application, backend, and Azure architecture for the MVP.",
      keyPoints: [
        ...recordToSentences(architecture).slice(0, 3),
        ...asStringArray(message.content.implementation_plan).slice(0, 2)
      ],
      sections: [
        section("Architecture Proposal", recordToSentences(architecture)),
        section("Implementation Plan", asStringArray(message.content.implementation_plan))
      ],
      raw: message.content
    };
  }

  if (message.step === "review_feedback") {
    const feedback = asRecordArray(message.content.feedback);
    return {
      ...base!,
      status,
      summary: `Claude reviewed the proposal and returned ${feedback.length} feedback item${feedback.length === 1 ? "" : "s"}.`,
      keyPoints: feedback.map(formatFeedbackItem).slice(0, 4),
      sections: [
        section("Review Findings", feedback.map(formatFeedbackItem)),
        section("Recommendations", feedback.map((item) => asString(item.recommendation)).filter(Boolean))
      ],
      raw: message.content
    };
  }

  if (message.step === "feedback_decisions") {
    const decisions = asRecordArray(message.content.feedback_decisions);
    const approved = decisions.filter((decision) => ["approved", "modified"].includes(asString(decision.decision)));
    return {
      ...base!,
      status,
      summary: `Gemini approved ${approved.length} review item${approved.length === 1 ? "" : "s"} for the final fix pass.`,
      keyPoints: decisions.map(formatDecisionItem).slice(0, 4),
      sections: [
        section("Approval Decisions", decisions.map(formatDecisionItem)),
        section("Approved Fixes", approved.map((decision) => asString(decision.modified_fix)).filter(Boolean))
      ],
      raw: message.content
    };
  }

  if (message.step === "final_solution") {
    const finalSolution = asRecord(message.content.final_solution);
    return {
      ...base!,
      status,
      summary: asString(finalSolution.summary) || "OpenAI returned the final solution with approved review fixes applied.",
      keyPoints: [
        ...asStringArray(finalSolution.delivery),
        ...asRecordArray(finalSolution.approved_fixes_applied).map((fix) => asString(fix.modified_fix)).filter(Boolean)
      ].slice(0, 5),
      sections: [
        section("Implementation Plan", asStringArray(finalSolution.delivery)),
        section(
          "Approved Fixes Applied",
          asRecordArray(finalSolution.approved_fixes_applied).map(formatDecisionItem)
        )
      ],
      raw: message.content
    };
  }

  return {
    ...(base ?? expectedWorkflowSteps[0]),
    id: message.step,
    agentName: base?.agentName ?? titleize(message.role),
    role: base?.role ?? "Completed a workflow step.",
    status,
    summary: `${titleize(message.step)} completed.`,
    keyPoints: recordToSentences(message.content).slice(0, 5),
    sections: [section(titleize(message.step), recordToSentences(message.content))],
    raw: message.content
  };
}

export function buildFinalResult(task: TaskRecord | null): FinalResultView {
  if (!task) {
    return {
      requested: "No request has run yet.",
      decision: "Submit a task to generate the final recommended solution.",
      approach: ["The agent workflow has not started."],
      risks: ["No risks or assumptions have been reviewed yet."],
      nextStep: "Enter a request and start the workflow.",
      raw: null
    };
  }

  const requirements = task.history.find((message) => message.step === "requirements")?.content;
  const architecture = task.history.find((message) => message.step === "architecture_proposal")?.content;
  const review = task.history.find((message) => message.step === "review_feedback")?.content;
  const decisions = task.history.find((message) => message.step === "feedback_decisions")?.content;
  const finalSolution = asRecord(task.final_output?.final_solution);
  const approvedFixes = asRecordArray(decisions?.feedback_decisions).filter((decision) =>
    ["approved", "modified"].includes(asString(decision.decision))
  );

  return {
    requested: task.user_request,
    decision:
      asString(finalSolution.summary) ||
      `The agents completed the workflow and approved ${approvedFixes.length} review item${approvedFixes.length === 1 ? "" : "s"}.`,
    approach: [
      ...recordToSentences(asRecord(architecture?.architecture)),
      ...asStringArray(finalSolution.delivery)
    ].slice(0, 6),
    risks: [
      ...asRecordArray(review?.feedback).map(formatFeedbackItem),
      ...approvedFixes.map((fix) => asString(fix.modified_fix)).filter(Boolean)
    ].slice(0, 6),
    nextStep:
      asStringArray(requirements?.acceptance_criteria)[0] ||
      "Review the final recommendation, then decide whether to implement the MVP plan.",
    raw: task.final_output
  };
}

function section(title: string, items: Array<string | undefined>): DetailSection {
  return { title, items: items.filter((item): item is string => Boolean(item)) };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asRecord).filter((item) => Object.keys(item).length > 0) : [];
}

function recordToSentences(record: Record<string, unknown>): string[] {
  return Object.entries(record)
    .map(([key, value]) => {
      if (typeof value === "string") {
        return `${titleize(key)}: ${value}`;
      }
      if (Array.isArray(value)) {
        return `${titleize(key)}: ${value.join(", ")}`;
      }
      return "";
    })
    .filter(Boolean);
}

function formatFeedbackItem(item: Record<string, unknown>): string {
  const severity = asString(item.severity);
  const finding = asString(item.finding);
  const recommendation = asString(item.recommendation);
  const prefix = severity ? `${titleize(severity)}: ` : "";
  return `${prefix}${finding || recommendation}`.trim();
}

function formatDecisionItem(item: Record<string, unknown>): string {
  const decision = asString(item.decision);
  const fix = asString(item.modified_fix);
  const reason = asString(item.reason);
  const label = decision ? `${titleize(decision)}: ` : "";
  return `${label}${fix || reason}`.trim();
}
