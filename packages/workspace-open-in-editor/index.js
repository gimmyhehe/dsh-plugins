/**
 * Host half of `dsh-workspace-open-in-editor`.
 *
 * Everything the feature does happens in the browser (`lib/client.js`):
 * the button that lands on each workspace row, and the launch request it
 * sends to the composed `@deepseek-ai/dsh-host-open-in-app` routes.
 *
 * This Node entry still has to exist — the web profile loads every enabled
 * plugin through its Node half — but it deliberately registers nothing.
 */

export const name = 'workspace-open-in-editor'

/**
 * No host-side behavior.
 * @param ctx - Cordis host context (unused).
 */
export function apply(ctx) {
  void ctx
}
