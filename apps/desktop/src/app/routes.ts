export const SESSION_ROUTE_PREFIX = '/'
export const NEW_CHAT_ROUTE = '/'
export const SETTINGS_ROUTE = '/settings'
export const COMMAND_CENTER_ROUTE = '/command-center'
export const SKILLS_ROUTE = '/skills'
export const MESSAGING_ROUTE = '/messaging'
// ARTIFACTS_ROUTE: Internal compatibility route only.
// User-facing artifacts entry points (sidebar, command palette, keybinds) have been removed.
// Direct access to /artifacts will redirect to home page.
export const ARTIFACTS_ROUTE = '/artifacts'
export const CRON_ROUTE = '/cron'
export const PROFILES_ROUTE = '/profiles'
export const AGENTS_ROUTE = '/agents'
export const STARMAP_ROUTE = '/starmap'
export const KARNA_ROUTE = '/karna'
export const KARNA_AGENTS_ROUTE = '/karna/agents'
export const KARNA_WRITER_ROUTE = '/karna/writer'
export const KARNA_SOUL_ROUTE = '/karna/soul'
export const KARNA_FLOW_ROUTE = '/karna/flow'
export const KARNA_MCP_ROUTE = '/karna/mcp'
export const KARNA_PLUGINS_ROUTE = '/karna/plugins'
export const KARNA_HOME_DEMO_ROUTE = '/karna/home-demo'
export const IDE_ROUTE_PREFIX = '/ide'

export function ideRoute(workspaceId: string): string {
  return `${IDE_ROUTE_PREFIX}/${encodeURIComponent(workspaceId)}`
}

export function workspaceIdFromIdeRoute(pathname: string): string | null {
  if (!pathname.startsWith(IDE_ROUTE_PREFIX + '/')) {
    return null
  }

  const id = pathname.slice(IDE_ROUTE_PREFIX.length + 1)

  return id && !id.includes('/') ? decodeURIComponent(id) : null
}

export const IDE_ROUTE = `${IDE_ROUTE_PREFIX}/:workspaceId`

export type AppView =
  | 'agents'
  | 'artifacts'
  | 'chat'
  | 'command-center'
  | 'cron'
  | 'karna'
  | 'karna-agents'
  | 'karna-writer'
  | 'karna-soul'
  | 'karna-flow'
  | 'karna-mcp'
  | 'karna-plugins'
  | 'karna-home-demo'
  | 'messaging'
  | 'not-found'
  | 'profiles'
  | 'settings'
  | 'skills'
  | 'starmap'
  | 'writer-ide'

export type AppRouteId =
  | 'agents'
  | 'artifacts'
  | 'command-center'
  | 'cron'
  | 'ide'
  | 'karna'
  | 'karna-agents'
  | 'karna-writer'
  | 'karna-soul'
  | 'karna-flow'
  | 'karna-mcp'
  | 'karna-plugins'
  | 'karna-home-demo'
  | 'messaging'
  | 'new'
  | 'not-found'
  | 'profiles'
  | 'settings'
  | 'skills'
  | 'starmap'

export interface AppRoute {
  id: AppRouteId
  path: string
  view: AppView
}

export const APP_ROUTES = [
  { id: 'new', path: NEW_CHAT_ROUTE, view: 'chat' },
  { id: 'settings', path: SETTINGS_ROUTE, view: 'settings' },
  { id: 'command-center', path: COMMAND_CENTER_ROUTE, view: 'command-center' },
  { id: 'skills', path: SKILLS_ROUTE, view: 'skills' },
  { id: 'messaging', path: MESSAGING_ROUTE, view: 'messaging' },
  { id: 'cron', path: CRON_ROUTE, view: 'cron' },
  { id: 'karna', path: KARNA_ROUTE, view: 'karna-agents' },
  { id: 'karna-agents', path: KARNA_AGENTS_ROUTE, view: 'karna-agents' },
  { id: 'karna-writer', path: KARNA_WRITER_ROUTE, view: 'karna-writer' },
  { id: 'karna-soul', path: KARNA_SOUL_ROUTE, view: 'karna-soul' },
  { id: 'karna-flow', path: KARNA_FLOW_ROUTE, view: 'karna-flow' },
  { id: 'karna-mcp', path: KARNA_MCP_ROUTE, view: 'karna-mcp' },
  { id: 'karna-plugins', path: KARNA_PLUGINS_ROUTE, view: 'karna-plugins' },
  { id: 'karna-home-demo', path: KARNA_HOME_DEMO_ROUTE, view: 'karna-home-demo' },
  { id: 'profiles', path: PROFILES_ROUTE, view: 'profiles' },
  { id: 'agents', path: AGENTS_ROUTE, view: 'agents' },
  { id: 'starmap', path: STARMAP_ROUTE, view: 'starmap' }
] as const satisfies readonly AppRoute[]

const APP_VIEW_BY_PATH = new Map<string, AppView>(APP_ROUTES.map(route => [route.path, route.view]))
const RESERVED_PATHS: ReadonlySet<string> = new Set([...APP_ROUTES.map(route => route.path), ARTIFACTS_ROUTE])

// Views that render as a full-screen modal card (OverlayView) over the shell.
// While one is open the app's titlebar control clusters must hide so they don't
// bleed over the overlay (they sit at a higher z-index than the overlay card).
export const OVERLAY_VIEWS: ReadonlySet<AppView> = new Set([
  'agents',
  'command-center',
  'cron',
  'profiles',
  'settings',
  'starmap'
])

export function isOverlayView(view: AppView): boolean {
  return OVERLAY_VIEWS.has(view)
}

export function isNewChatRoute(pathname: string): boolean {
  return pathname === NEW_CHAT_ROUTE
}

export function routeSessionId(pathname: string): string | null {
  if (!pathname.startsWith(SESSION_ROUTE_PREFIX) || RESERVED_PATHS.has(pathname)) {
    return null
  }

  const id = pathname.slice(SESSION_ROUTE_PREFIX.length)

  return id && !id.includes('/') ? decodeURIComponent(id) : null
}

export function sessionRoute(sessionId: string): string {
  return `${SESSION_ROUTE_PREFIX}${encodeURIComponent(sessionId)}`
}

export function appViewForPath(pathname: string): AppView {
  if (workspaceIdFromIdeRoute(pathname)) {
    return 'writer-ide'
  }

  if (isNewChatRoute(pathname) || routeSessionId(pathname)) {
    return 'chat'
  }

  return APP_VIEW_BY_PATH.get(pathname) ?? 'not-found'
}
