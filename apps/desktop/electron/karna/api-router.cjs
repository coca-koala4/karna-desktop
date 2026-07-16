'use strict'

function createApiRouter() {
  const routes = []

  function registerRoute(method, routePath, handler) {
    const entry = {
      method: String(method || '').toUpperCase(),
      path: routePath,
      handler
    }
    routes.push(entry)
  }

  function matchRoute(method, urlPath) {
    const upperMethod = String(method || '').toUpperCase()
    const normalized = urlPath.endsWith('/') && urlPath.length > 1
      ? urlPath.slice(0, -1)
      : urlPath

    for (const route of routes) {
      if (route.method !== upperMethod) continue
      if (route.path === normalized || route.path === urlPath) {
        return route.handler
      }
    }
    return null
  }

  function getRoutes() {
    return [...routes]
  }

  return { registerRoute, matchRoute, getRoutes }
}

module.exports = { createApiRouter }
