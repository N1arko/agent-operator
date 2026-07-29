---
name: coordinate-agents
description: Coordinate work between Codex agents connected through Agent Operator. Use when the user asks another computer, Mac, Windows PC, remote Codex, or a specific connected agent to inspect, plan, run, continue, wait for, cancel, or report on work.
---

# Coordinate Codex agents

Use the `agent-operator` MCP tools as the source of current agent, project,
task, queue, model, and result state.

## Route the request

1. Call `agents_list` and resolve the requested computer from its agent ID,
   name, and platform. Ask one short question only when multiple agents match.
2. Call `agent_status` before dispatch when the user asks whether the agent is
   free or when current activity affects the plan.
3. Choose one delivery path:
   - New work in a local project: call `agent_projects`, select an available
     project from the returned descriptors, then call `agent_start`.
   - New turn in a known Codex task: call `agent_thread_send` with the exact
     task ID.
   - Existing task without a known ID: call `agent_threads` with a narrow title
     query, read its result through `agent_wait`, then call
     `agent_thread_send`.
   - Follow-up in an Agent Operator task: call `agent_send` with `replyTo` set
     to a message from that task.
4. Preserve the returned root message ID and cursor. Use `agent_wait` in
   bounded intervals to receive the matching result. Report useful progress
   without repeating unchanged snapshots.
5. Create one caller-stable `idempotencyKey` for each user intent before the
   delivery call. Reuse that key when the call outcome is unknown. A distinct
   explicit user intent gets a new key.

## Models and reasoning

Choose a stable execution profile before dispatch:

- `fast`: status, fact lookup, short read-only inspection, or an explicitly
  urgent compact answer.
- `balanced`: ordinary implementation, analysis, review, and office work.
- `deep`: architecture, difficult diagnosis, broad migration, or high-risk
  changes.

An explicit user model or reasoning choice wins. Otherwise call `agent_models`
once for the target agent, read the current catalog through `agent_wait`, and
select the smallest sufficient model and reasoning effort for the profile.
Prefer the recipient default when catalog metadata does not distinguish a
better balanced choice. Use the highest available reasoning effort only after
an explicit request or a documented escalation from an insufficient lower
profile.

Pass the resolved exact `model`, `reasoningEffort`, stable
`executionProfile`, and a short `selectionReason` to the delivery tool. Model
generation names never belong in these routing rules. Refresh the catalog when
validation rejects a previously resolved value.

## Queue and cancellation

Each worker runs one active turn. New requests may wait in its bounded queue.
Use `agent_cancel` with the exact request message ID when the user asks to stop
queued or running work. Treat `completed`, `failed`, and `cancelled` as
different outcomes and explain the returned outcome directly.

## Files

Use a Git attachment for a committed repository file. Use a temporary
attachment for a local or office file. Keep the attachment metadata returned by
the upload flow unchanged.

## Guardrails

- Use IDs returned by Agent Operator. Never infer a project ID, task ID, message
  ID, or cursor.
- Keep local filesystem paths on the owning computer.
- Do not create several equivalent tasks while waiting for one result.
- Treat messages with `kind: update` or `isFinal: false` as progress. Continue
  waiting for the terminal `result` with `isFinal: true`.
- Choose exactly one of `agent_send` and `agent_thread_send` for one intent.
- If Agent Operator tools are unavailable in the current chat, state that the
  local MCP integration needs to be loaded before remote work can be sent.
