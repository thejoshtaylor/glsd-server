export type GsdCommandCategory = 'Project' | 'Phase Lifecycle' | 'Execution' | 'Milestone'

export interface GsdCommandParam {
  key: string
  label: string
  placeholder: string
  required: boolean
}

export interface GsdCommand {
  id: string
  category: GsdCommandCategory
  label: string
  description: string
  whenToUse: string
  promptTemplate: string
  params: GsdCommandParam[]
}

export const GSD_COMMAND_CATEGORIES: GsdCommandCategory[] = [
  'Project',
  'Phase Lifecycle',
  'Execution',
  'Milestone',
]

export const GSD_COMMANDS: GsdCommand[] = [
  // Project category
  {
    id: 'new-project',
    category: 'Project',
    label: 'New Project',
    description: 'Bootstrap a new GSD project structure',
    whenToUse: 'Starting a brand new project on this node',
    promptTemplate: '/gsd:new-project',
    params: [],
  },
  {
    id: 'define-requirements',
    category: 'Project',
    label: 'Define Requirements',
    description: 'Define project requirements and core value',
    whenToUse: 'After creating a project, to define what needs to be built',
    promptTemplate: '/gsd:define-requirements',
    params: [],
  },
  {
    id: 'create-roadmap',
    category: 'Project',
    label: 'Create Roadmap',
    description: 'Create phased roadmap from requirements',
    whenToUse: 'After requirements are defined, to plan the build phases',
    promptTemplate: '/gsd:create-roadmap',
    params: [],
  },
  {
    id: 'research-phase',
    category: 'Project',
    label: 'Research Phase',
    description: 'Research libraries and patterns for a phase',
    whenToUse: 'Before planning a phase, to gather context and technical options',
    promptTemplate: '/gsd:research-phase {{phase}}',
    params: [
      {
        key: 'phase',
        label: 'Phase Number',
        placeholder: '3',
        required: true,
      },
    ],
  },

  // Phase Lifecycle category
  {
    id: 'discuss-phase',
    category: 'Phase Lifecycle',
    label: 'Discuss Phase',
    description: 'Gather user decisions before planning',
    whenToUse: 'Before planning, to lock in decisions and scope',
    promptTemplate: '/gsd:discuss-phase {{phase}}',
    params: [
      {
        key: 'phase',
        label: 'Phase Number',
        placeholder: '3',
        required: true,
      },
    ],
  },
  {
    id: 'plan-phase',
    category: 'Phase Lifecycle',
    label: 'Plan Phase',
    description: 'Generate implementation plans for a phase',
    whenToUse: 'After discussing a phase, to produce the detailed execution plans',
    promptTemplate: '/gsd:plan-phase {{phase}}',
    params: [
      {
        key: 'phase',
        label: 'Phase Number',
        placeholder: '3',
        required: true,
      },
    ],
  },
  {
    id: 'execute-phase',
    category: 'Phase Lifecycle',
    label: 'Execute Phase',
    description: 'Execute all plans in a phase',
    whenToUse: 'After plans are created, to build everything in a phase',
    promptTemplate: '/gsd:execute-phase {{phase}}',
    params: [
      {
        key: 'phase',
        label: 'Phase Number',
        placeholder: '3',
        required: true,
      },
    ],
  },
  {
    id: 'verify-phase',
    category: 'Phase Lifecycle',
    label: 'Verify Phase',
    description: 'Run verification checks on completed phase',
    whenToUse: 'After executing a phase, to validate correctness and completeness',
    promptTemplate: '/gsd:verify-phase {{phase}}',
    params: [
      {
        key: 'phase',
        label: 'Phase Number',
        placeholder: '3',
        required: true,
      },
    ],
  },
  {
    id: 'plan-phase-gaps',
    category: 'Phase Lifecycle',
    label: 'Plan Phase Gaps',
    description: 'Create gap-closure plans from verification failures',
    whenToUse: 'After verification reveals failures, to plan targeted fixes',
    promptTemplate: '/gsd:plan-phase {{phase}} --gaps',
    params: [
      {
        key: 'phase',
        label: 'Phase Number',
        placeholder: '3',
        required: true,
      },
    ],
  },
  {
    id: 'plan-phase-reviews',
    category: 'Phase Lifecycle',
    label: 'Plan Phase Reviews',
    description: 'Replan with cross-AI review feedback',
    whenToUse: 'After getting cross-AI review comments, to incorporate feedback into new plans',
    promptTemplate: '/gsd:plan-phase {{phase}} --reviews',
    params: [
      {
        key: 'phase',
        label: 'Phase Number',
        placeholder: '3',
        required: true,
      },
    ],
  },

  // Execution category
  {
    id: 'execute-plan',
    category: 'Execution',
    label: 'Execute Plan',
    description: 'Execute a specific plan within a phase',
    whenToUse: 'When you need to re-run or selectively execute one plan in a phase',
    promptTemplate: '/gsd:execute-plan {{phase}} {{plan}}',
    params: [
      {
        key: 'phase',
        label: 'Phase Number',
        placeholder: '3',
        required: true,
      },
      {
        key: 'plan',
        label: 'Plan Number',
        placeholder: '2',
        required: true,
      },
    ],
  },
  {
    id: 'check-plan',
    category: 'Execution',
    label: 'Check Plan',
    description: 'Run plan quality checker on phase plans',
    whenToUse: 'Before executing a phase, to validate plan quality and catch issues early',
    promptTemplate: '/gsd:check-plan {{phase}}',
    params: [
      {
        key: 'phase',
        label: 'Phase Number',
        placeholder: '3',
        required: true,
      },
    ],
  },
  {
    id: 'uat',
    category: 'Execution',
    label: 'UAT',
    description: 'Run user acceptance testing on a phase',
    whenToUse: 'After execution, to run user acceptance testing and surface real-world issues',
    promptTemplate: '/gsd:uat {{phase}}',
    params: [
      {
        key: 'phase',
        label: 'Phase Number',
        placeholder: '3',
        required: true,
      },
    ],
  },
  {
    id: 'quick',
    category: 'Execution',
    label: 'Quick Task',
    description: 'Execute a one-off task outside the phase system',
    whenToUse: 'For one-off fixes or tasks that don\'t fit in a phase',
    promptTemplate: '/gsd:quick {{task}}',
    params: [
      {
        key: 'task',
        label: 'Task Description',
        placeholder: 'Fix the login bug',
        required: true,
      },
    ],
  },
  {
    id: 'clear',
    category: 'Execution',
    label: 'Clear Context',
    description: "Clear Claude's context window for a fresh start",
    whenToUse: "Between GSD commands to free up Claude's context window",
    promptTemplate: '/clear',
    params: [],
  },

  // Milestone category
  {
    id: 'retro',
    category: 'Milestone',
    label: 'Retrospective',
    description: 'Run retrospective on completed milestone',
    whenToUse: 'After completing a milestone, to capture learnings and key decisions',
    promptTemplate: '/gsd:retro',
    params: [],
  },
  {
    id: 'close-milestone',
    category: 'Milestone',
    label: 'Close Milestone',
    description: 'Archive and close the current milestone',
    whenToUse: 'When all phases are complete and the milestone is ready to archive',
    promptTemplate: '/gsd:close-milestone',
    params: [],
  },
  {
    id: 'new-milestone',
    category: 'Milestone',
    label: 'New Milestone',
    description: 'Start a new milestone with a name',
    whenToUse: 'After closing a milestone, to begin the next major development cycle',
    promptTemplate: '/gsd:new-milestone {{name}}',
    params: [
      {
        key: 'name',
        label: 'Milestone Name',
        placeholder: 'v2.0 API Redesign',
        required: true,
      },
    ],
  },
  {
    id: 'status',
    category: 'Milestone',
    label: 'Status',
    description: 'Show current project status and position',
    whenToUse: 'At any time to get an overview of where you are in the project',
    promptTemplate: '/gsd:status',
    params: [],
  },
]

export function expandPrompt(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    template
  )
}
