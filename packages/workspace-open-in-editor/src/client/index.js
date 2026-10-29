/**
 * `dsh-workspace-open-in-editor` — browser half.
 *
 * Puts one hover button on every workspace row of the Web sidebar, between the
 * row's "..." menu and its "new session" button, and opens that workspace's
 * directory in an installed editor when clicked:
 *
 * - click            → the remembered editor (VS Code until the user picks Cursor)
 * - Option/Alt+click → the other installed editor, remembered for next time
 *
 * Why DOM adaptation instead of a slot: `@deepseek-ai/dsh-client-ui-workspace`
 * declares `sidebar.workspaces.session.row.action` for *session* rows only. A
 * workspace row (the project row that owns the "..." and "+" buttons) has no
 * slot in 0.2.x, so the only way to extend it without forking the package is to
 * extend the rendered row. The selectors below are deliberately structural
 * (`data-row-key`, CSS-module suffix, neighbouring button) rather than pinned
 * to a build hash, and every step degrades to "leave the row alone".
 *
 * Launching reuses the composed `@deepseek-ai/dsh-host-open-in-app` routes
 * (`/open-in-app/apps|icon|open`), which already resolve installed editors and
 * scrub the child environment. When those routes are absent the plugin stays
 * dormant instead of rendering a button that cannot work.
 */

/** Editor id → product name. Host catalog ids come from `dsh-host-open-in-app`. */
const EDITORS = {
  vscode: 'VS Code',
  cursor: 'Cursor',
}

const STORAGE_KEY = 'dsh.workspace-open-in-editor.editor'
const MARK_ATTR = 'data-dsh-workspace-open-editor'
const ROW_SELECTOR = '[data-row-key^="workspace:"]'
const ACTIONS_SELECTOR = '[class*="_rowActions"]'
const ROW_KEY_PREFIX = 'workspace:'

/** Browser-relative forms of the host routes (the page may sit under a prefix). */
const APPS_ROUTE = 'open-in-app/apps'
const ICON_ROUTE = 'open-in-app/icon'
const OPEN_ROUTE = 'open-in-app/open'

/** Fallback glyph when the host has no icon for an editor. */
const FALLBACK_ICON =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
      '<path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4" fill="none" stroke="#8b8b8b" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  )

export const name = 'workspace-open-in-editor'

/** Client services: workspace rows/paths, and the active locale for labels. */
export const inject = ['workspaces', 'locale']

/**
 * Install the workspace-row button.
 * @param ctx - client Cordis context.
 */
export function apply(ctx) {
  const text = (zh, en) => ctx.locale.resolveText({ zh, en })

  /** Editor ids the host reports as installed, filtered to the ones we label. */
  let installed = []
  /** Remembered editor id; re-validated against `installed` on every use. */
  let remembered = readRemembered()
  /** True once the host answered the catalog request (successfully or not). */
  let catalogSettled = false

  let frame = 0
  let timer = 0

  const known = () => installed.filter((id) => Object.hasOwn(EDITORS, id))

  /** The editor a plain click should use: remembered if installed, else the first. */
  const primary = () => {
    const list = known()
    return list.includes(remembered) ? remembered : list[0]
  }

  /** The editor Option/Alt+click should use. */
  const secondary = () => known().find((id) => id !== primary())

  const label = (app) => text(`在 ${EDITORS[app]} 中打开项目`, `Open project in ${EDITORS[app]}`)

  const hint = (app) => {
    const other = secondary()
    const extra = other === undefined ? '' : text(`（⌥/Alt 点击：${EDITORS[other]}）`, ` (⌥/Alt: ${EDITORS[other]})`)
    return label(app) + extra
  }

  const workspacePath = (workspaceId) => {
    try {
      const items = ctx.workspaces.list.getSnapshot()?.items ?? []
      return items.find((item) => item.workspaceId === workspaceId)?.path
    } catch {
      return undefined
    }
  }

  /**
   * Reconcile every rendered workspace row: add the button where it is missing,
   * refresh labels where the remembered editor changed, and drop buttons when
   * the host has no usable editor.
   */
  const sync = () => {
    frame = 0
    if (!catalogSettled) return

    const rows = document.querySelectorAll(ROW_SELECTOR)
    if (known().length === 0) {
      for (const button of document.querySelectorAll(`[${MARK_ATTR}]`)) button.remove()
      return
    }

    for (const row of rows) {
      if (workspaceIdOf(row) === undefined) continue
      const button = ensureButton(row)
      if (button !== undefined) decorate(button)
    }
  }

  const schedule = () => {
    if (frame !== 0 || timer !== 0) return
    // Coalesce the burst a row re-render (or a streaming chat) produces.
    timer = setTimeout(() => {
      timer = 0
      frame = requestAnimationFrame(sync)
    }, 120)
  }

  /** Last-or-create the button inside one row's action strip. */
  const ensureButton = (row) => {
    const actions = row.querySelector(ACTIONS_SELECTOR)
    if (actions === null) return undefined

    const existing = actions.querySelector(`[${MARK_ATTR}]`)
    if (existing !== null) return existing

    const anchor = actions.lastElementChild
    if (anchor === null || !(anchor instanceof HTMLElement)) return undefined

    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute(MARK_ATTR, '1')
    // Borrow the neighbouring icon button's classes so hover, size and focus
    // ring stay identical to the row's own buttons across theme changes.
    button.className = anchor.className
    button.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;padding:0'
    button.draggable = false

    const icon = document.createElement('img')
    icon.alt = ''
    icon.width = 14
    icon.height = 14
    icon.draggable = false
    icon.style.cssText = 'width:14px;height:14px;display:block;pointer-events:none'
    button.append(icon)

    button.addEventListener('dragstart', (event) => event.stopPropagation())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void open(row, button, event.altKey)
    })

    actions.insertBefore(button, anchor)
    return button
  }

  /** Refresh icon, tooltip and accessible name from the current state. */
  const decorate = (button) => {
    const app = primary()
    if (app === undefined) return
    if (button.dataset.editor !== app) {
      button.dataset.editor = app
      const icon = button.querySelector('img')
      if (icon !== null) {
        icon.dataset.fallback = ''
        icon.src = `${ICON_ROUTE}/${app}`
        icon.onerror = () => {
          if (icon.dataset.fallback === '1') return
          icon.dataset.fallback = '1'
          icon.src = FALLBACK_ICON
        }
      }
    }
    const description = hint(app)
    button.title = description
    button.setAttribute('aria-label', description)
  }

  /** Open one workspace directory in one editor. */
  const open = async (row, button, alt) => {
    const workspaceId = workspaceIdOf(row)
    const path = workspaceId === undefined ? undefined : workspacePath(workspaceId)
    if (path === undefined) {
      flash(button, text('找不到项目目录', 'Project directory unavailable'))
      return
    }
    const target = alt ? secondary() ?? primary() : primary()
    if (target === undefined) return

    const previous = remembered
    if (alt && target !== remembered) {
      remembered = target
      writeRemembered(target)
      decorate(button)
    }

    try {
      const response = await fetch(OPEN_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app: target, path }),
      })
      if (!response.ok) throw new Error(`open-in-app refused the launch (${response.status})`)
    } catch (error) {
      remembered = previous
      writeRemembered(previous)
      decorate(button)
      flash(button, text('打开失败：编辑器未响应', 'Could not launch the editor'))
      console.warn('[workspace-open-in-editor]', error)
    }
  }

  /** Show a temporary failure in the button's tooltip. */
  const flash = (button, message) => {
    button.dataset.dshError = message
    button.title = message
    button.setAttribute('aria-label', message)
    setTimeout(() => {
      delete button.dataset.dshError
      decorate(button)
    }, 3200)
  }

  const loadCatalog = async () => {
    let apps = []
    try {
      const response = await fetch(APPS_ROUTE, { headers: { accept: 'application/json' } })
      if (response.ok) {
        const payload = await response.json()
        if (Array.isArray(payload?.apps)) apps = payload.apps.filter((id) => typeof id === 'string')
      }
    } catch {
      // Route absent or page not authenticated: stay dormant.
    }
    installed = apps
    catalogSettled = true
    schedule()
  }

  ctx.effect(() => {
    const observer = new MutationObserver(() => schedule())
    observer.observe(document.body, { childList: true, subtree: true })

    const unsubscribe = ctx.workspaces.list.subscribe(() => schedule())
    const unsubscribeLocale = ctx.locale.subscribe(() => schedule())

    void loadCatalog()

    return () => {
      observer.disconnect()
      unsubscribe()
      unsubscribeLocale()
      if (timer !== 0) clearTimeout(timer)
      if (frame !== 0) cancelAnimationFrame(frame)
      for (const button of document.querySelectorAll(`[${MARK_ATTR}]`)) button.remove()
    }
  }, 'workspace-open-in-editor: workspace row buttons')
}

/**
 * Read the workspace id out of a row's `data-row-key` (`workspace:<id>`).
 * Ungrouped rows carry an empty key and get no button.
 * @param row - one `[data-row-key^="workspace:"]` element.
 */
function workspaceIdOf(row) {
  const key = row.getAttribute('data-row-key') ?? ''
  if (!key.startsWith(ROW_KEY_PREFIX)) return undefined
  const id = key.slice(ROW_KEY_PREFIX.length)
  return id === '' ? undefined : id
}

function readRemembered() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value !== null && Object.hasOwn(EDITORS, value) ? value : 'vscode'
  } catch {
    return 'vscode'
  }
}

function writeRemembered(app) {
  try {
    localStorage.setItem(STORAGE_KEY, app)
  } catch {
    // Storage disabled: the in-memory choice still holds for this page.
  }
}
