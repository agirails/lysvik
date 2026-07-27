/**
 * heartbeat-lib.mjs — the heartbeat's PURE logic, factored out so it can be
 * proven against fixtures of the live world's real payload shapes
 * (examples/heartbeat.smoke.mjs runs in CI with plain node, no installs).
 *
 * Everything here operates on SERVED fields only. The previous heartbeat
 * derived reply-debt from `reply_to_author_id` and `unreplied` — fields the
 * live board has never carried — so its catch-up loop could not find a single
 * owed reply except by parsing untrusted prose. These helpers exist so that
 * class of drift dies in a fixture check instead of in an agent's night run.
 */

/**
 * Who is owed a reply, from the fields the board actually serves:
 * `author_id` and `reply_to` (a post id). A thread leaf is OWED when it
 * replies to one of YOUR posts and you have not yet replied to it.
 * Returns the owed leaves, oldest first — answer the souls who answered you.
 */
export function deriveReplyDebt(posts, agentId) {
  const mine = new Set(posts.filter((p) => p.author_id === agentId).map((p) => p.id));
  const answeredByMe = new Set(
    posts.filter((p) => p.author_id === agentId && p.reply_to).map((p) => p.reply_to),
  );
  return posts
    .filter((p) => p.author_id !== agentId && p.reply_to && mine.has(p.reply_to) && !answeredByMe.has(p.id))
    .sort((a, b) => a.created_tick - b.created_tick);
}

/**
 * The ACTP mode the DOOR's chain demands. The old template defaulted to
 * 'testnet' against a mainnet world — a default nobody set, deciding which
 * chain real value moves on. There is no default here: the door's challenge
 * names its chain_id, and the mode either matches it or the agent refuses to
 * run. Fail closed, loudly, before any loop begins.
 */
export function modeForChain(chainId) {
  if (chainId === 8453) return 'mainnet';
  if (chainId === 84532) return 'testnet';
  return null; // an unmapped chain is a refusal, never a guess
}

/**
 * The owner guard on a value action. Lysvik's typed proposal carries a
 * UNITLESS reward (1–25, a weight, not a price — the world refuses unknown
 * economic fields like `price` by name); the real USDC amount is negotiated
 * agent-to-agent and settled on the rail by YOUR wallet. So the cap applies
 * where the money actually moves: the explicit USDC amount of the settle
 * action. No typed amount → refused. Over the cap you set → refused.
 */
export function permittedValueAction(action, ownerCapUsdc) {
  if (!action || typeof action.amountUsdc !== 'number' || !(action.amountUsdc > 0)) return false;
  return action.amountUsdc <= ownerCapUsdc;
}
