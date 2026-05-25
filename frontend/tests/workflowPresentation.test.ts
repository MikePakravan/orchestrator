import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFinalResult, buildStepView, buildWorkflowSteps, titleize } from "../src/workflowPresentation.ts";
import type { AgentMessage, TaskRecord } from "../src/types.ts";

const requirementsMessage: AgentMessage = {
  role: "gemini_boss",
  step: "requirements",
  created_at: "2026-05-25T00:00:00Z",
  content: {
    product_goal: "Create a dev-only multi-agent orchestrator MVP.",
    requirements: ["Accept a user request from the UI.", "Persist task history."],
    acceptance_criteria: ["A user can submit a request and see every workflow step."]
  }
};

const architectureMessage: AgentMessage = {
  role: "openai_architect_builder",
  step: "architecture_proposal",
  created_at: "2026-05-25T00:00:01Z",
  content: {
    architecture: {
      frontend: "React/Vite single-page app.",
      backend: "FastAPI API.",
      cloud: "Azure App Service in Australia East."
    },
    implementation_plan: ["Create typed contracts.", "Store task history."]
  }
};

const reviewMessage: AgentMessage = {
  role: "claude_reviewer",
  step: "review_feedback",
  created_at: "2026-05-25T00:00:02Z",
  content: {
    feedback: [
      {
        severity: "high",
        finding: "Provider credentials must be read from environment variables only.",
        recommendation: "Keep API keys out of source files."
      }
    ]
  }
};

const decisionMessage: AgentMessage = {
  role: "gemini_boss",
  step: "feedback_decisions",
  created_at: "2026-05-25T00:00:03Z",
  content: {
    feedback_decisions: [
      {
        decision: "approved",
        modified_fix: "Keep API keys out of source files, README examples, and logs."
      }
    ]
  }
};

const finalMessage: AgentMessage = {
  role: "openai_architect_builder",
  step: "final_solution",
  created_at: "2026-05-25T00:00:04Z",
  content: {
    final_solution: {
      summary: "Updated implementation proposal with Gemini-approved review fixes applied.",
      delivery: ["React frontend", "FastAPI backend", "Azure dev IaC"],
      approved_fixes_applied: [
        {
          decision: "approved",
          modified_fix: "Keep API keys out of source files, README examples, and logs."
        }
      ]
    }
  }
};

const task: TaskRecord = {
  task_id: "task-1",
  status: "completed",
  user_request: "Build a Confluence-grounded assistant app on Azure App Service in Australia East.",
  history: [requirementsMessage, architectureMessage, reviewMessage, decisionMessage, finalMessage],
  final_output: finalMessage.content
};

test("titleize converts raw field names into readable headings", () => {
  assert.equal(titleize("acceptance_criteria"), "Acceptance Criteria");
  assert.equal(titleize("api_contract"), "API Contract");
});

test("buildStepView converts requirements JSON into friendly sections", () => {
  const step = buildStepView(requirementsMessage, "completed");

  assert.equal(step.agentName, "Gemini Boss");
  assert.equal(step.status, "completed");
  assert.equal(step.sections[0].title, "Product Goal");
  assert.equal(step.sections[1].title, "Requirements");
  assert.ok(step.keyPoints.includes("Accept a user request from the UI."));
  assert.equal(step.raw, requirementsMessage.content);
});

test("buildWorkflowSteps preserves all five expected agent steps", () => {
  const steps = buildWorkflowSteps(task, false);

  assert.deepEqual(
    steps.map((step) => step.agentName),
    ["Gemini Boss", "OpenAI Architect/Builder", "Claude Reviewer", "Gemini Approval Gate", "OpenAI Final/Fixer"]
  );
  assert.ok(steps.every((step) => step.status === "completed"));
});

test("buildFinalResult creates a readable final recommendation", () => {
  const result = buildFinalResult(task);

  assert.equal(result.requested, task.user_request);
  assert.equal(result.decision, "Updated implementation proposal with Gemini-approved review fixes applied.");
  assert.ok(result.approach.includes("Cloud: Azure App Service in Australia East."));
  assert.ok(result.risks.some((risk) => risk.includes("Provider credentials")));
  assert.equal(result.raw, task.final_output);
});
