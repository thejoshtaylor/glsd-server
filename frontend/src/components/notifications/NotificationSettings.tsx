import { useNotifications } from '@/hooks/useNotifications'
import { Button } from '@/components/ui/button'
import { Bell, BellOff } from '@/lib/icons'

export function NotificationSettings() {
  const { permission, requestPermission } = useNotifications()

  // If Notification API not supported, don't render
  if (typeof Notification === 'undefined') return null

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50">
      <div className="flex items-center gap-2 text-sm">
        {permission === 'granted' ? (
          <Bell size={16} className="text-primary" />
        ) : (
          <BellOff size={16} className="text-muted-foreground" />
        )}
        <span className="text-foreground">Browser Notifications</span>
        <span className="text-muted-foreground text-xs">
          {permission === 'granted' && '(enabled)'}
          {permission === 'denied' && '(blocked by browser)'}
          {permission === 'default' && '(not enabled)'}
        </span>
      </div>
      {permission === 'default' && (
        <Button
          variant="outline"
          size="sm"
          onClick={requestPermission}
        >
          Enable
        </Button>
      )}
      {permission === 'denied' && (
        <span className="text-xs text-muted-foreground">
          Reset in browser settings
        </span>
      )}
      {permission === 'granted' && (
        <span className="text-xs text-green-400">Active</span>
      )}
    </div>
  )
}
