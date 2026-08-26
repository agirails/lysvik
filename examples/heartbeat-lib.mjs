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
  // Review finding (July 2026): `amount > NaN` is false for EVERY amount, so an invalid
  // cap (a mistyped env var) silently became "no cap". A cap that is not a
  // finite non-negative number permits nothing — a broken guard fails closed.
  if (!Number.isFinite(ownerCapUsdc) || ownerCapUsdc < 0) return false;
  if (!action || typeof action.amountUsdc !== 'number' || !(action.amountUsdc > 0)) return false;
  return action.amountUsdc <= ownerCapUsdc;
}

/**
 * The release binding — value moves by ESCROW RELEASE, never a fresh payment.
 *
 * Two defects died here (review findings, July 2026). First: nothing bound the
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
 * This function binds the release to your authenticated book AND your own
 * records, by refusal: the contract is YOURS as requester (a provider never
 * releases) · state is 'delivered' — the only state in which release is owed
 * ('settled' refuses by its own name: never retry a terminal tx) · and the
 * escrow id comes ONLY from `escrowRecords` — the durable contract→escrow
 * map YOUR OWN funding/attach receipts wrote. The model cannot supply one:
 * a prose-planted escrow id could name a DIFFERENT delivered escrow this
 * wallet requested and release it early (a prior review finding). A contract
 * with no recorded escrow refuses — absence denies.
 *
 * The owner cap is not consulted here: the amount was capped when YOUR
 * wallet funded the escrow. The cap governs escrow CREATION, not release —
 * and your records file is release's own authority: no record, no release.
 */
export function boundRelease(settle, book, escrowRecords, agentId) {
  // Pre-push review finding (the sixth fail-open-on-absence this cycle, found in
  // the guard built to close the fourth): the identity is a REQUIRED leg —
  // an absent agentId must refuse, never let NOT_YOUR_CONTRACT stand down.
  if (typeof agentId !== 'string' || agentId.length === 0) {
    return { ok: false, reason: 'MISSING_AGENT_ID' };
  }
  if (!settle || typeof settle.contract_id !== 'string' || settle.contract_id.length === 0) {
    return { ok: false, reason: 'NO_CONTRACT_ID' };
  }
  // Pass-3 F2: a MALFORMED book must refuse by name, never satisfy the
  // predicate or throw a bare TypeError — a money guard fails closed on
  // shapes it does not recognise.
  const rows = (side) => {
    const arr = book?.[side];
    if (!Array.isArray(arr)) return null;
    return arr.every((c) => c !== null && typeof c === 'object' && !Array.isArray(c)) ? arr : null;
  };
  const asProvider = rows('as_provider');
  const asRequester = rows('as_requester');
  if (asProvider === null || asRequester === null) return { ok: false, reason: 'BAD_BOOK' };
  // A provider never releases: check the provider side FIRST so a contract
  // carried both ways (impossible today, cheap to refuse) refuses loudly.
  if (asProvider.some((c) => c.id === settle.contract_id)) {
    return { ok: false, reason: 'PAYER_IS_PROVIDER' };
  }
  // Exactly ONE requester row may carry the id — duplicates are a
  // contradiction, and .find() would silently pick whichever came first.
  const matches = asRequester.filter((c) => c.id === settle.contract_id);
  if (matches.length === 0) return { ok: false, reason: 'NOT_IN_YOUR_BOOK' };
  if (matches.length > 1) return { ok: false, reason: 'AMBIGUOUS_BOOK' };
  const contract = matches[0];
  // The row must actually be YOURS — membership in a served list is a
  // weaker claim than the row's own requester field agreeing.
  if (contract.requester_id !== agentId) {
    return { ok: false, reason: 'NOT_YOUR_CONTRACT' };
  }
  if (contract.state === 'settled') return { ok: false, reason: 'ALREADY_SETTLED' };
  if (contract.state !== 'delivered') return { ok: false, reason: 'NOT_DELIVERED' };
  if (typeof contract.provider_id !== 'string' || contract.provider_id.trim().length === 0) {
    // delivered implies claimed implies a provider — but absence must deny,
    // and a whitespace provider is an absence wearing a string's clothes.
    return { ok: false, reason: 'NO_COUNTERPARTY' };
  }
  // Own-property lookup only: a records file is data, never a prototype walk.
  const recorded = escrowRecords !== null && typeof escrowRecords === 'object'
    && Object.prototype.hasOwnProperty.call(escrowRecords, settle.contract_id)
    ? escrowRecords[settle.contract_id] : undefined;
  if (typeof recorded !== 'string' || recorded.length === 0) {
    return { ok: false, reason: 'NO_RECORDED_ESCROW' };
  }
  return { ok: true, escrow_id: recorded };
}

/**
 * The dispute-window gate (a prior review finding). The kernel enforces the window
 * against everyone EXCEPT the requester — the SDK explicitly permits early
 * requester release. But the window exists FOR the requester: it is your
 * inspection hour. The canonical loop therefore holds its own hour, from the
 * rail transaction's own facts (client.advanced.getTransaction), fail-closed:
 *   · not DELIVERED on the rail → refuse (the village row is a weaker claim);
 *   · completedAt of 0/absent, or no window value → WINDOW_UNVERIFIED — the
 *     template refuses rather than guesses (release by hand if you mean it);
 *   · the on-chain disputeWindow is an ABSOLUTE end-timestamp; older shapes
 *     carry a relative duration — both are handled, both fail closed while
 *     the window stands open.
 */
export function releaseWindowState(tx, nowSeconds) {
  if (!tx || tx.state !== 'DELIVERED') return { ok: false, reason: 'NOT_DELIVERED_ON_RAIL' };
  const completedAt = typeof tx.completedAt === 'number' ? tx.completedAt : 0;
  const win = typeof tx.disputeWindow === 'number' ? tx.disputeWindow : 0;
  if (completedAt <= 0 || win <= 0) return { ok: false, reason: 'WINDOW_UNVERIFIED' };
  // Absolute if it reads as a plausible epoch AFTER delivery; else a duration.
  const endsAt = win > 1_000_000_000 && win > completedAt ? win : completedAt + win;
  if (nowSeconds <= endsAt) return { ok: false, reason: 'WINDOW_OPEN', ends_at: endsAt };
  return { ok: true };
}

/**
 * The action cursor from a digest response. Observed on mainnet 2026-08-26: the FIRST
 * digest of a fresh body (`since_seq=0`) answers 410 RETENTION_EXCEEDED carrying
 * `snapshot_seq` — the safe cursor; a normal 200 carries `latest_seq`. Anything else is
 * not a cursor and must not be guessed.
 */
export function cursorFromDigest(status, body) {
  if (status === 200 && Number.isInteger(body?.latest_seq)) return body.latest_seq;
  if (status === 410 && body?.error === 'RETENTION_EXCEEDED' && Number.isInteger(body?.snapshot_seq)) return body.snapshot_seq;
  throw new Error(`digest ${status}: no cursor (${JSON.stringify(body).slice(0, 120)})`);
}
