'use strict'

const slugify = text => {
  const raw = String(text == null ? '' : text).trim()
  if (!raw) return `project-${Date.now()}`
  const ascii = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  // eslint-disable-next-line no-control-regex -- sanitization deliberately strips control bytes.
  const nativeSlug = raw.replace(/[<>:"/|?*\x00-\x1F]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  if (/[a-z]/i.test(ascii) || !nativeSlug) return ascii || `project-${Date.now()}`
  return nativeSlug
}

module.exports = { slugify }
