import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BookOpen, Copy, CheckCircle } from '@/lib/icons'

export const Route = createFileRoute('/dashboard/onboarding')({
  component: OnboardingPage,
})

interface Step {
  number: number
  title: string
  command: string
}

const STEPS: Step[] = [
  {
    number: 1,
    title: 'Install the GSD CLI',
    command: 'npm install -g @gsd/cli',
  },
  {
    number: 2,
    title: 'Configure Your Node',
    command: 'gsd node configure --server https://your-server-url --token your-api-token',
  },
  {
    number: 3,
    title: 'Start Your Node',
    command: 'gsd node start',
  },
]

function CopyButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(command)
    toast.success('Copied!')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      aria-label="Copy command"
      className="absolute top-2 right-2 text-muted-foreground hover:text-primary"
    >
      {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
    </Button>
  )
}

function OnboardingStepCard({ step }: { step: Step }) {
  return (
    <Card className="border-primary/15 p-4">
      <CardHeader className="px-0 pt-0 pb-3">
        <div className="flex items-center gap-3">
          <span
            className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-semibold"
            aria-hidden="true"
          >
            {step.number}
          </span>
          <CardTitle className="text-xl font-semibold font-heading">{step.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <pre className="bg-muted text-foreground font-mono text-sm rounded-md px-4 py-3 relative overflow-x-auto">
          <code>{step.command}</code>
          <CopyButton command={step.command} />
        </pre>
      </CardContent>
    </Card>
  )
}

function OnboardingPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6 animate-in fade-in duration-150 fill-mode-both">
      <div className="space-y-2">
        <h1 className="text-[28px] font-semibold font-heading leading-[1.1] inline-flex items-center gap-2 text-foreground">
          <BookOpen size={24} className="text-primary" />
          Getting Started
        </h1>
        <p className="text-sm text-muted-foreground">
          Follow these steps to connect your first GSD node to the server.
        </p>
      </div>

      <div className="space-y-6">
        {STEPS.map((step) => (
          <OnboardingStepCard key={step.number} step={step} />
        ))}
      </div>
    </div>
  )
}
