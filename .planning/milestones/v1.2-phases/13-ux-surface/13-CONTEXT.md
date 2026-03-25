# Phase 13: UX Surface - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Create an onboarding guide page at /dashboard/onboarding and enhance the execute form with project picker, preset prompts, and plain-language labels. Add navigation link and empty-state CTA. No backend changes — all frontend.

</domain>

<decisions>
## Implementation Decisions

### Onboarding Page Layout & Content
- Single scrollable page with numbered step cards — each step is a Card component with a step number badge, title, and code block with copy button
- 3 setup steps: (1) Install GSD CLI, (2) Configure node with server URL + token, (3) Start the node
- Inline copy button on each code block; shows "Copied!" toast via Sonner (existing toast system)
- No live connection status indicator on onboarding page — UXE-02 is deferred

### Execute Form Enhancements
- Project picker: shadcn Select dropdown populated from `node.projects` array (data already available from node state)
- Preset prompt selector: shadcn Select above the prompt textarea with 4-5 presets (e.g., "Review code", "Fix bugs", "Write tests", "Explain codebase"); selecting populates textarea but remains editable
- Plain-language labels above each field with subtle helper text below (e.g., "What should Claude do?" instead of "Prompt")
- Session ID field collapsed into an "Advanced" disclosure — keeps form simple by default

### Navigation & Empty State Integration
- Sidebar nav: add "Getting Started" link as third item between "Audit Log" and "Sign out", with BookOpen icon from Lucide
- Empty node list: replace "No nodes found" text with a styled Card containing a link to /dashboard/onboarding — "Get started by connecting your first node" with arrow link
- Onboarding link uses same nav styling as Dashboard/Audit Log — consistent, no special highlighting

### Claude's Discretion
- Exact preset prompt text and number of presets (4-5 range)
- Step card visual treatment (borders, badges, spacing)
- Code block styling within step cards
- Helper text wording for form fields
- "Advanced" disclosure component choice (details/summary or custom)
- Page title and heading treatment

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/ui/card.tsx` — Card, CardHeader, CardTitle, CardDescription, CardContent
- `frontend/src/components/ui/select.tsx` — shadcn Select component
- `frontend/src/components/ui/button.tsx` — Button with glow-cyan variant
- `frontend/src/components/execute/ExecuteForm.tsx` — existing execute form to enhance
- `frontend/src/components/nodes/NodeGrid.tsx` — contains empty state message to update
- `frontend/src/lib/icons.ts` — Lucide icon re-exports (add BookOpen, Copy, ChevronDown as needed)
- Sonner toast system for copy confirmation

### Established Patterns
- OKLCH cyberpunk color palette with cyan primary (195°), magenta accent (330°)
- Orbitron for headings (font-heading), Geist for body
- Routes defined in `frontend/src/routes/dashboard/` as TanStack Router file routes
- `data-slot` attributes on shadcn components
- Skeleton loading states for async content

### Integration Points
- `frontend/src/routes/__root.tsx` — sidebar nav; add "Getting Started" link
- `frontend/src/routes/dashboard/onboarding.tsx` — new route file for onboarding page
- `frontend/src/components/execute/ExecuteForm.tsx` — enhance with project picker, presets, labels
- `frontend/src/components/nodes/NodeGrid.tsx` — update empty state with onboarding CTA

</code_context>

<specifics>
## Specific Ideas

- Use `node.projects` array from node state for project picker population — no new API endpoint needed
- Copy button should use `navigator.clipboard.writeText()` with Sonner toast feedback
- Preset prompts should be a simple constant array, not fetched from backend
- The onboarding page should work even when no nodes are connected (it's the bootstrapping guide)

</specifics>

<deferred>
## Deferred Ideas

- Onboarding connection status indicator showing live connection check (UXE-02 — future requirement)
- Prompt history/favorites for quick re-execution (UXE-03 — future requirement)
- Prompt templates library with categories (out of scope — preset selector with editable textarea is sufficient)

</deferred>
