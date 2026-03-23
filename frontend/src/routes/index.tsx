import { createFileRoute, redirect } from '@tanstack/react-router'
import { getAccessToken } from '../lib/api'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (getAccessToken()) {
      throw redirect({ to: '/dashboard' })
    }
    throw redirect({ to: '/login' })
  },
})
