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
  // Codex S102 F2: `amount > NaN` is false for EVERY amount, so an invalid
  // cap (a mistyped env var) silently became "no cap". A cap that is not a
  // finite non-negative number permits nothing — a broken guard fails closed.
  if (!Number.isFinite(ownerCapUsdc) || ownerCapUsdc < 0) return false;
  if (!action || typeof action.amountUsdc !== 'number' || !(action.amountUsdc > 0)) return false;
  return action.amountUsdc <= ownerCapUsdc;
}

/**
 * The release binding — value moves by ESCROW RELEASE, never a fresh payment.
 *
 * Two defects died here (S102, codex F1/F3). First: nothing bound the
 * RECIPIENT — a model that read board prose and emitted `settle.to` closed
 * the loop from untrusted text to a real payment. Second, and deeper: any
 * direct `basic.pay()` on a delivered contract is a SECOND value channel
 * beside the escrow — an attached contract later released would pay twice,
 * and an unbound one could be paid again every beat (no world state moves).
 *
 * So the canonical loop performs the lifecycle's OWN verb and nothing else:
 * `client.release(escrowId)` — the escrow YOU created and funded, whose
 * payee and amount the KERNEL fixed at funding. There is no address to
 * steer, no amount to inflate, and no second channel: releasing a terminal
 * escrow refuses on-chain, so a replayed release cannot double-pay.
 *
 * This function binds the release to your authenticated book, by refusal:
 * the contract is YOURS as requester (a provider never releases) · state is
 * 'delivered' — the only state in which release is owed ('settled' refuses
 * by its own name: never retry a terminal tx) · the escrow id is the one
 * YOUR records carry from when you created and attached it (write-once,
 * poster-only — the world's attach receipt is your durable copy).
 *
 * The owner cap is not consulted here: the amount was capped when YOUR
 * wallet funded the escrow. The cap governs escrow CREATION, not release.
 */
export function boundRelease(settle, book) {
  if (!settle || typeof settle.contract_id !== 'string' || settle.contract_id.length === 0) {
    return { ok: false, reason: 'NO_CONTRACT_ID' };
  }
  if (typeof settle.escrow_id !== 'string' || settle.escrow_id.length === 0) {
    return { ok: false, reason: 'NO_ESCROW_ID' };
  }
  // A provider never releases: check the provider side FIRST so a contract
  // carried both ways (impossible today, cheap to refuse) refuses loudly.
  if ((book?.as_provider ?? []).some((c) => c.id === settle.contract_id)) {
    return { ok: false, reason: 'PAYER_IS_PROVIDER' };
  }
  const contract = (book?.as_requester ?? []).find((c) => c.id === settle.contract_id);
  if (!contract) return { ok: false, reason: 'NOT_IN_YOUR_BOOK' };
  if (contract.state === 'settled') return { ok: false, reason: 'ALREADY_SETTLED' };
  if (contract.state !== 'delivered') return { ok: false, reason: 'NOT_DELIVERED' };
  if (typeof contract.provider_id !== 'string' || contract.provider_id.length === 0) {
    // delivered implies claimed implies a provider — but absence must deny.
    return { ok: false, reason: 'NO_COUNTERPARTY' };
  }
  return { ok: true, escrow_id: settle.escrow_id };
}
