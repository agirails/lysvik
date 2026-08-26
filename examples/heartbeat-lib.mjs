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
  // Argus F6 (2026-08-26): a bare escrow id "bound" nothing — any non-empty string released.
  // A record is now { escrow_id, provider_wallet, amount_base_units }: what YOUR wallet funded,
  // for whom, how much — and bindEscrow() holds the rail transaction to it before release.
  if (typeof recorded === 'string') return { ok: false, reason: 'RECORD_LEGACY_UNBOUND' };
  if (recorded === null || typeof recorded !== 'object' || Array.isArray(recorded)
    || typeof recorded.escrow_id !== 'string' || recorded.escrow_id.length === 0) {
    return { ok: false, reason: 'NO_RECORDED_ESCROW' };
  }
  return { ok: true, escrow_id: recorded.escrow_id, record: recorded };
}

// ═══ Argus Wave 2 (2026-08-26) ═══════════════════════════════════════════════

/** F2 — the board's STRUCTURAL facts, with the prose removed. The planner sees ids, authors,
 *  reply edges, ticks and a TYPED proposal (exact keys, bounded numbers) — never a body.
 *  A proposal that fails the schema is null: a smuggled term dies here, not in decide(). */
// Veyra R2 (e23f012): the bands are the WORLD's, not this file's. contracts/board-proposal.schema.json
// is captured from the served action contract at the pinned world; the smoke gate holds this
// constant to that file in both directions (a valid live value must never be dropped; an
// impossible one must never become a planner fact).
import { readFileSync } from 'node:fs';
const SCHEMA_FILE = JSON.parse(readFileSync(new URL('../contracts/board-proposal.schema.json', import.meta.url), 'utf8'));
export const PROPOSAL_SCHEMA = Object.freeze({ ctype: SCHEMA_FILE.ctype, verb: SCHEMA_FILE.verb, qty: SCHEMA_FILE.qty, reward: SCHEMA_FILE.reward, deadline_in_ticks: SCHEMA_FILE.deadline_in_ticks, rules: SCHEMA_FILE.rules, supersedes_pattern: SCHEMA_FILE.supersedes_pattern });
const SUPERSEDES_RE = new RegExp(SCHEMA_FILE.supersedes_pattern);
// Veyra R2 (8ddb249): enums alone admitted capability+fish, service+haul, scroll+serve, goods+carve —
// the world's validateProposal couples ctype → verb → good vocabulary (→ qty). Same rules, from the file.
function crossFieldOk(p) {
  const r = PROPOSAL_SCHEMA.rules?.[p.ctype];
  if (!r) return false;
  if (r.verb !== undefined && p.verb !== r.verb) return false;
  if (r.verb_not_in !== undefined && r.verb_not_in.includes(p.verb)) return false;
  if (r.good_in !== undefined && !r.good_in.includes(p.good)) return false;
  if (r.good_pattern !== undefined && !new RegExp(r.good_pattern).test(p.good)) return false;
  if (r.qty !== undefined && p.qty !== r.qty) return false;
  return true;
}
const inBand = (v, band) => Number.isInteger(v) && v >= band.min && v <= band.max;
const PROPOSAL_KEYS = ['kind', 'ctype', 'verb', 'good', 'qty', 'reward', 'deadline_in_ticks'];
// Veyra R2-final: `supersedes` is the one optional field a client may SEND (exact ^pr_[0-9a-f]{6,64}$;
// a wrong type or value refuses by name, never silently dropped). `proposal_id` is the WORLD's echo on
// served rows — extraction reads it; a decision that carries it is refused (server: UNKNOWN_PROPOSAL_FIELD).
const PROPOSAL_OPTIONAL = ['supersedes'];
const SERVED_ONLY = ['proposal_id'];
function typedProposal(raw, { served = false } = {}) {
  let p = raw;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch { return null; } }
  if (p === null || typeof p !== 'object' || Array.isArray(p)) return null;
  const keys = Object.keys(p);
  const allowed = served ? [...PROPOSAL_KEYS, ...PROPOSAL_OPTIONAL, ...SERVED_ONLY] : [...PROPOSAL_KEYS, ...PROPOSAL_OPTIONAL];
  if (keys.some((k) => !allowed.includes(k))) return null;
  if (p.supersedes !== undefined && (typeof p.supersedes !== 'string' || !SUPERSEDES_RE.test(p.supersedes))) return null;
  if (PROPOSAL_KEYS.some((k) => !(k in p))) return null;
  if (p.kind !== 'contract') return null;
  if (!PROPOSAL_SCHEMA.ctype.includes(p.ctype)) return null;
  if (!PROPOSAL_SCHEMA.verb.includes(p.verb)) return null;
  if (typeof p.good !== 'string' || p.good.length === 0) return null; // vocabulary/pattern bound per ctype in crossFieldOk
  if (!inBand(p.qty, PROPOSAL_SCHEMA.qty)) return null;
  if (!inBand(p.reward, PROPOSAL_SCHEMA.reward)) return null;
  if (!inBand(p.deadline_in_ticks, PROPOSAL_SCHEMA.deadline_in_ticks)) return null;
  if (!crossFieldOk(p)) return null;
  const out = { kind: 'contract', ctype: p.ctype, verb: p.verb, good: p.good, qty: p.qty, reward: p.reward, deadline_in_ticks: p.deadline_in_ticks };
  if (typeof p.supersedes === 'string') out.supersedes = p.supersedes;
  if (served && typeof p.proposal_id === 'string') out.proposal_id = p.proposal_id;
  return out;
}
export function boardFacts(posts) {
  if (!Array.isArray(posts)) return [];
  return posts
    .filter((p) => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.author_id === 'string')
    .map((p) => ({
      id: p.id,
      author_id: p.author_id,
      reply_to: typeof p.reply_to === 'string' ? p.reply_to : null,
      created_tick: Number.isFinite(p.created_tick) ? p.created_tick : 0,
      proposal: typedProposal(p.proposal, { served: true }),
      has_body: typeof p.body === 'string' && p.body.length > 0,
    }));
}
/** F2 — the OTHER channel: agent-authored prose, carried separately so a planner that wants
 *  to read it must reach for it by name, and never receives it as a fact. */
export function untrustedBoardText(posts) {
  if (!Array.isArray(posts)) return [];
  return posts.filter((p) => p && typeof p.id === 'string').map((p) => ({ id: p.id, body: typeof p.body === 'string' ? p.body : '' }));
}
/** F2 — the decision schema. Exact keys, one act, known targets, bounded numbers. Anything a
 *  model (or the prose it read) tries to add has no field to land in and refuses BY NAME. */
const BODY_MAX = 2000;
export function validateDecision(d, known) {
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return { ok: false, reason: 'BAD_DECISION' };
  const acts = Object.keys(d).filter((k) => d[k] !== undefined);
  if (acts.some((k) => !['reply', 'post', 'settle'].includes(k))) return { ok: false, reason: 'UNKNOWN_KEY' };
  if (acts.length > 1) return { ok: false, reason: 'MULTIPLE_ACTS' };
  if (acts.length === 0) return { ok: true, decision: {} };
  const exact = (o, allowed) => o !== null && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every((k) => allowed.includes(k));
  if ('reply' in d) {
    const r = d.reply;
    if (!exact(r, ['id', 'body'])) return { ok: false, reason: 'UNKNOWN_KEY' };
    if (typeof r.id !== 'string' || !known?.postIds?.has(r.id)) return { ok: false, reason: 'BAD_REPLY_TARGET' };
    if (typeof r.body !== 'string' || r.body.length === 0) return { ok: false, reason: 'BAD_BODY' };
    if (r.body.length > BODY_MAX) return { ok: false, reason: 'BODY_TOO_LONG' };
    return { ok: true, decision: { reply: { id: r.id, body: r.body } } };
  }
  if ('post' in d) {
    const p = d.post;
    if (!exact(p, ['body', 'proposal'])) return { ok: false, reason: 'UNKNOWN_KEY' };
    if (typeof p.body !== 'string' || p.body.length === 0) return { ok: false, reason: 'BAD_BODY' };
    if (p.body.length > BODY_MAX) return { ok: false, reason: 'BODY_TOO_LONG' };
    const out = { post: { body: p.body } };
    if (p.proposal !== undefined) {
      if (!exact(p.proposal, [...PROPOSAL_KEYS, ...PROPOSAL_OPTIONAL])) return { ok: false, reason: 'UNKNOWN_KEY' };
      if (p.proposal.supersedes !== undefined && (typeof p.proposal.supersedes !== 'string' || !SUPERSEDES_RE.test(p.proposal.supersedes))) return { ok: false, reason: 'BAD_SUPERSEDES' };
      const tp = typedProposal(p.proposal);
      if (tp === null) return { ok: false, reason: 'OUT_OF_RANGE' };
      out.post.proposal = tp;
    }
    return { ok: true, decision: out };
  }
  const s = d.settle;
  if (!exact(s, ['contract_id'])) return { ok: false, reason: 'UNKNOWN_KEY' };
  if (typeof s.contract_id !== 'string' || !known?.contractIds?.has(s.contract_id)) return { ok: false, reason: 'NOT_IN_YOUR_BOOK' };
  return { ok: true, decision: { settle: { contract_id: s.contract_id } } };
}
/** F4 — an accepted action is queued, not applied. The observation digest carries the outcome:
 *  action_applied | action_rejected | action_quarantined, joined on action_id. Absent ⇒ pending. */
export function actionOutcome(events, actionId) {
  if (!Array.isArray(events) || typeof actionId !== 'string') return { status: 'pending' };
  for (const e of events) {
    if (!e || e.action_id !== actionId) continue;
    if (e.type === 'action_applied') return { status: 'applied', seq: e.seq };
    if (e.type === 'action_rejected' || e.type === 'action_quarantined') return { status: 'refused', reason: typeof e.reason === 'string' ? e.reason : e.type, seq: e.seq };
  }
  return { status: 'pending' };
}
/** F6 — the rail transaction must BE the escrow your record says you funded: your wallet as
 *  requester, the recorded provider, the recorded amount. Kernel facts vs your own receipt;
 *  nothing here comes from the world's rows or from prose. */
const ADDR = /^0x[0-9a-f]{40}$/i; // checksum-mixed case and an upper-cased prefix are the same address
const addrEq = (a, b) => typeof a === 'string' && typeof b === 'string' && ADDR.test(a) && ADDR.test(b) && a.toLowerCase() === b.toLowerCase();
export function bindEscrow(tx, record, ownWallet) {
  if (typeof ownWallet !== 'string' || !ADDR.test(ownWallet)) return { ok: false, reason: 'MISSING_WALLET' };
  if (record === null || typeof record !== 'object' || typeof record.provider_wallet !== 'string'
    || !ADDR.test(record.provider_wallet) || typeof record.amount_base_units !== 'string'
    || !/^[0-9]+$/.test(record.amount_base_units)) return { ok: false, reason: 'RECORD_INCOMPLETE' };
  if (!tx || typeof tx !== 'object') return { ok: false, reason: 'NO_RAIL_TX' };
  if (!addrEq(tx.requester, ownWallet)) return { ok: false, reason: 'ESCROW_REQUESTER_MISMATCH' };
  if (!addrEq(tx.provider, record.provider_wallet)) return { ok: false, reason: 'ESCROW_PROVIDER_MISMATCH' };
  // Veyra R4: BigInt() coerces true→1, "0x10"→16, a float→its integer — a money guard must
  // accept only the two honest shapes: a bigint, or a plain decimal string (SDK 4.9.0's
  // advanced runtime). Anything else is a mismatch by name, before any conversion.
  let amt;
  if (typeof tx.amount === 'bigint') amt = tx.amount;
  else if (typeof tx.amount === 'string' && /^[0-9]+$/.test(tx.amount)) amt = BigInt(tx.amount);
  else return { ok: false, reason: 'ESCROW_AMOUNT_MISMATCH' };
  if (amt !== BigInt(record.amount_base_units)) return { ok: false, reason: 'ESCROW_AMOUNT_MISMATCH' };
  return { ok: true };
}
/** F7 — the world origin is PINNED. LYSVIK_WORLD_URL alone does nothing (a stray env var must
 *  never redirect a signed join or a bearer session); an override needs the explicit flag and
 *  must be https, or http to localhost. */
export const WORLD_DEFAULT = 'https://world.lysvik.app';
export function worldOrigin(env) {
  const e = env ?? {};
  if (e.LYSVIK_ALLOW_WORLD_OVERRIDE !== '1' || !e.LYSVIK_WORLD_URL) return { url: WORLD_DEFAULT, overridden: false };
  let u;
  try { u = new URL(e.LYSVIK_WORLD_URL); } catch { throw new Error(`INSECURE_WORLD_URL: LYSVIK_WORLD_URL is not a URL: '${e.LYSVIK_WORLD_URL}'`); }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error(`INSECURE_WORLD_URL: an override must be https (or http to localhost), got '${e.LYSVIK_WORLD_URL}'`);
  return { url: u.origin, overridden: true };
}
/** F7 — and the door must agree: the challenge's deployment_origin (with its explicit :443)
 *  must name the origin you are about to sign for. Missing ⇒ mismatch. */
export function originMatchesDeployment(worldUrl, deploymentOrigin) {
  if (typeof worldUrl !== 'string' || typeof deploymentOrigin !== 'string') return false;
  try {
    const a = new URL(worldUrl), b = new URL(deploymentOrigin);
    const port = (u) => u.port || (u.protocol === 'https:' ? '443' : '80');
    return a.protocol === b.protocol && a.hostname === b.hostname && port(a) === port(b);
  } catch { return false; }
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
  // Argus F3 (2026-08-26): NaN is typeof 'number' and every comparison with it is false,
  // so a malformed read used to fall through to ok:true. Finite, positive, or unverified.
  const completedAt = Number.isFinite(tx.completedAt) ? tx.completedAt : 0;
  const win = Number.isFinite(tx.disputeWindow) ? tx.disputeWindow : 0;
  if (!(completedAt > 0) || !(win > 0) || !Number.isFinite(nowSeconds)) return { ok: false, reason: 'WINDOW_UNVERIFIED' };
  // Absolute if it reads as a plausible epoch AFTER delivery; else a duration.
  const endsAt = win > 1_000_000_000 && win > completedAt ? win : completedAt + win;
  if (nowSeconds <= endsAt) return { ok: false, reason: 'WINDOW_OPEN', ends_at: endsAt };
  return { ok: true };
}

/** Veyra R1 (e23f012): no bearer may leave before the door has bound the origin — and a public
 *  route never needs one. The helper decides per request, from the path and a BOUND flag the
 *  loop sets only after originMatchesDeployment() passed: public routes → no Authorization,
 *  ever; agent/owner routes → Authorization only when bound, else a refusal by name. */
const PUBLIC_ROUTE = /^\/(?:worlds\/lysvik\/(?:join\/challenge|presence|work|board(?:\/facts)?|rail|sites|actions)(?:\?|$)|api\/|health(?:\?|$)|\.well-known\/)/;
export function bearerPolicy(path, bound) {
  if (typeof path !== 'string') throw new Error('NOT_BOUND: no path');
  if (PUBLIC_ROUTE.test(path)) return { authorize: false };
  if (bound !== true) throw new Error(`NOT_BOUND: refusing to send a bearer to ${path} before the door's deployment_origin is bound`);
  return { authorize: true };
}

/** F4 — the digest's own recovery: a 410 RETENTION_EXCEEDED names snapshot_seq, the safe cursor.
 *  Given the refusal body (parsed, or the thrown error's text), return the seq to resume from,
 *  or null when the refusal is something else. The live run of minimal-agent died here first
 *  (since_seq=0 on a world with 120k events) — the world taught the remedy; the loop ignored it. */
export function retentionCursor(refusal) {
  let body = refusal;
  if (typeof body === 'string') { const i = body.indexOf('{'); if (i < 0) return null; try { body = JSON.parse(body.slice(i)); } catch { return null; } }
  if (!body || typeof body !== 'object' || body.error !== 'RETENTION_EXCEEDED') return null;
  return Number.isInteger(body.snapshot_seq) && body.snapshot_seq >= 0 ? body.snapshot_seq : null;
}
