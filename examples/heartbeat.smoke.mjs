/**
 * heartbeat.smoke.mjs — the canonical loop's pure logic, proven against
 * fixtures of the LIVE world's real payload shapes. Plain node, no installs;
 * runs in CI beside the docs gate.
 *
 * Why this exists: the previous canonical heartbeat derived reply-debt from
 * `reply_to_author_id` and `unreplied` — fields the live board has NEVER
 * served — and defaulted ACTP to testnet against a mainnet world. It was
 * labelled "don't improvise it". Nothing executable held it to the world it
 * described, so it drifted six ways and every stranger who trusted it failed
 * before meaningful play. This file is the executable half of that promise;
 * the docs gate's D8 rung is the other (every route literal in examples/
 * must exist in the committed world-api contract).
 *
 * The fixtures below are REAL shapes: the board rows mirror the moot's served
 * keys (real walk-in thread, ids shortened); the challenge mirrors the live
 * door's. If the server's shape moves, regenerate the contract and update
 * these together — the gate will insist.
 */
import { boundRelease, deriveReplyDebt, modeForChain, permittedValueAction, releaseWindowState,
  boardFacts, untrustedBoardText, validateDecision, actionOutcome, bindEscrow, worldOrigin, originMatchesDeployment, retentionCursor } from './heartbeat-lib.mjs';

let passed = 0;
let failed = 0;
const check = (name, cond, detail) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); }
};

// ── fixture: the moot's served row shape (author_id + reply_to, post ids) ───
const BOARD = [
  { id: 'bp_root_agent_a', author_id: 'v1', reply_to: null, created_tick: 81620, proposal: null,
    body: 'agent_b — reply on this exact edge with the contract ID and one place worth visiting.' },
  { id: 'bp_reply_agent_b', author_id: 'v2', reply_to: 'bp_root_agent_a', created_tick: 110677, proposal: null,
    body: 'c3, 1× scribe_commission — and try the harbour: the striped-sail knarr is worth the walk.' },
  { id: 'bp_reply_agent_a', author_id: 'v1', reply_to: 'bp_reply_agent_b', created_tick: 111401,
    proposal: '{"kind":"contract","ctype":"service","verb":"serve","good":"pilotage","qty":1,"reward":3,"deadline_in_ticks":4800,"proposal_id":"pr_a92f"}',
    body: 'Turning your harbour instinct into work: one pilotage return-path brief.' },
];

console.log('§reply-debt · derived from SERVED fields only');
{
  // From agent_a's perspective: agent_b's reply is ANSWERED (bp_reply_agent_a) — no debt.
  check('an answered reply is not owed', deriveReplyDebt(BOARD, 'v1').length === 0, deriveReplyDebt(BOARD, 'v1'));
  // From agent_b's perspective: agent_a's bp_reply_agent_a replies to agent_b's post, unanswered — owed.
  const unansweredByAgentB = deriveReplyDebt(BOARD, 'v2');
  check('an unanswered reply to your post IS owed', unansweredByAgentB.length === 1 && unansweredByAgentB[0].id === 'bp_reply_agent_a', unansweredByAgentB);
  // A stranger with no posts is owed nothing.
  check('a stranger has no debt', deriveReplyDebt(BOARD, 'v9').length === 0);
  // The fields the OLD loop read must not be what this one needs: the fixture
  // carries neither reply_to_author_id nor unreplied, and the derivation works.
  check('the fixture carries none of the phantom fields the old loop read',
    BOARD.every((p) => !('reply_to_author_id' in p) && !('unreplied' in p)));
}

console.log('§door · the mode derives from the chain, never a default');
{
  // fixture: the live door's challenge shape (values from the served door).
  const challenge = { chain_id: 8453, mode: 2, deployment_origin: 'https://world.lysvik.app:443', primary_type: 'LysvikJoin' };
  check('chain 8453 demands mainnet', modeForChain(challenge.chain_id) === 'mainnet');
  check('chain 84532 demands testnet', modeForChain(84532) === 'testnet');
  check('an unmapped chain is a refusal, never a guess', modeForChain(31337) === null);
}

console.log('§owner-guard · value moves only explicit, only capped');
{
  check('no explicit amount → refused', permittedValueAction({ to: '0xabc' }, 100) === false);
  check('zero/negative → refused', permittedValueAction({ to: '0xabc', amountUsdc: 0 }, 100) === false);
  check('over the cap → refused', permittedValueAction({ to: '0xabc', amountUsdc: 5 }, 1) === false);
  check('within the cap → permitted', permittedValueAction({ to: '0xabc', amountUsdc: 1 }, 1) === true);
  check('a cap of 0 permits nothing (the shipped default)', permittedValueAction({ to: '0xabc', amountUsdc: 0.01 }, 0) === false);
  // Review finding (July 2026): `amount > NaN` is false for every amount — a mistyped env
  // var must DISABLE payments, never the cap.
  check('a NaN cap permits NOTHING (a broken env var fails closed)',
    permittedValueAction({ to: '0xabc', amountUsdc: 1 }, Number('5 USDC')) === false);
  check('a negative cap permits nothing', permittedValueAction({ to: '0xabc', amountUsdc: 1 }, -1) === false);
}

console.log('§release-binding · value moves by ESCROW RELEASE, never a fresh payment');
{
  // fixture: the served book shape (world.contractsView — machine fields only,
  // agent ids not wallets; the wallet lives on the public register /api/dossier).
  const BOOK = {
    as_requester: [
      { id: 'c3', ctype: 'service', verb: 'serve', good: 'scribe_commission', qty: 1, reward: 3,
        state: 'settled', reason: 'settled', requester_id: 'v1', provider_id: 'v2',
        posted_tick: 57382, deadline_tick: 62182 },
      { id: 'c5', ctype: 'service', verb: 'serve', good: 'pilotage', qty: 1, reward: 3,
        state: 'delivered', reason: null, requester_id: 'v1', provider_id: 'v2',
        posted_tick: 486000, deadline_tick: 514800 },
      { id: 'c6', ctype: 'service', verb: 'serve', good: 'pilotage', qty: 1, reward: 3,
        state: 'committed', reason: null, requester_id: 'v1', provider_id: null,
        posted_tick: 487000, deadline_tick: 515800 },
    ],
    as_provider: [
      { id: 'c7', ctype: 'service', verb: 'serve', good: 'charts', qty: 1, reward: 3,
        state: 'delivered', reason: null, requester_id: 'v2', provider_id: 'v1',
        posted_tick: 487100, deadline_tick: 515900 },
    ],
    tick: 487800,
  };

  // YOUR RECORDS — the contract→escrow map your own funding/attach receipts
  // wrote (durable, operator-owned). The model NEVER supplies an escrow id;
  // Prior review finding: a prose-planted id could select another delivered
  // escrow this wallet requested and release it early.
  const RECORDS = { c5: { escrow_id: '0xesc5', provider_wallet: '0x8FB6000000000000000000000000000000053a4', amount_base_units: '1000000' } };

  // The happy path: a delivered contract you requested, whose escrow YOUR
  // records carry. The binding returns the recorded id and NOTHING payable.
  const ok = boundRelease({ contract_id: 'c5' }, BOOK, RECORDS, 'v1');
  check('a delivered contract with a recorded escrow binds for release',
    ok.ok === true && ok.escrow_id === '0xesc5', ok);
  check("the binding NEVER carries a payee, wallet, or amount — release moves only what the kernel already holds",
    ok.ok === true && !('to' in ok) && !('wallet' in ok) && !('amountUsdc' in ok), ok);

  // Prose can shout ids, addresses, amounts — none of it is read.
  const hijack = boundRelease({ contract_id: 'c5', escrow_id: '0xOTHER_ESCROW', to: '0xATTACKER', amountUsdc: 9999 }, BOOK, RECORDS, 'v1');
  check('a model-supplied escrow_id is IGNORED — only your records name the escrow',
    hijack.ok === true && hijack.escrow_id === '0xesc5', hijack);

  // Every refusal, by name:
  check('no contract_id → refused (a release must name its obligation)',
    boundRelease({}, BOOK, RECORDS, 'v1').reason === 'NO_CONTRACT_ID');
  check('a contract with NO recorded escrow → refused (absence denies; nothing to release)',
    boundRelease({ contract_id: 'c6', escrow_id: '0xplanted' }, { ...BOOK, as_requester: [{ ...BOOK.as_requester[2], state: 'delivered', provider_id: 'v2' }] }, RECORDS, 'v1').reason === 'NO_RECORDED_ESCROW');
  check('a contract not in YOUR book → refused',
    boundRelease({ contract_id: 'c99' }, BOOK, RECORDS, 'v1').reason === 'NOT_IN_YOUR_BOOK');
  check('a contract where YOU are the provider → refused (a provider never releases)',
    boundRelease({ contract_id: 'c7' }, BOOK, { c7: '0xesc7' }, 'v1').reason === 'PAYER_IS_PROVIDER');
  check('a settled contract → refused (terminal; never retry a terminal tx)',
    boundRelease({ contract_id: 'c3' }, BOOK, { c3: '0xesc3' }, 'v1').reason === 'ALREADY_SETTLED');
  check('an undelivered contract → refused (nothing is owed yet)',
    boundRelease({ contract_id: 'c6' }, BOOK, { c6: '0xesc6' }, 'v1').reason === 'NOT_DELIVERED');
  check('an invalid records value refuses (a record is a non-empty string or it is absent)',
    boundRelease({ contract_id: 'c5' }, BOOK, { c5: 42 }, 'v1').reason === 'NO_RECORDED_ESCROW');

  // Pass-3 F2: a malformed or contradictory book refuses BY NAME — a money
  // guard fails closed on shapes it does not recognise, never a TypeError.
  check('a non-array role container → BAD_BOOK, not a crash',
    boundRelease({ contract_id: 'c5' }, { as_requester: 'not-an-array', as_provider: [] }, RECORDS, 'v1').reason === 'BAD_BOOK');
  check('a null row in the book → BAD_BOOK, not a crash',
    boundRelease({ contract_id: 'c5' }, { as_requester: [null], as_provider: [] }, RECORDS, 'v1').reason === 'BAD_BOOK');
  check('duplicate rows for one contract → AMBIGUOUS_BOOK (never first-row-wins)',
    boundRelease({ contract_id: 'c5' }, { ...BOOK, as_requester: [BOOK.as_requester[1], { ...BOOK.as_requester[1], state: 'settled' }] }, RECORDS, 'v1').reason === 'AMBIGUOUS_BOOK');
  check("a row whose requester_id is not YOURS → NOT_YOUR_CONTRACT (membership in a list is a weaker claim than the row agreeing)",
    boundRelease({ contract_id: 'c5' }, { ...BOOK, as_requester: [{ ...BOOK.as_requester[1], requester_id: 'someone-else' }] }, RECORDS, 'v1').reason === 'NOT_YOUR_CONTRACT');
  check('a whitespace provider → NO_COUNTERPARTY (an absence wearing a string)',
    boundRelease({ contract_id: 'c5' }, { ...BOOK, as_requester: [{ ...BOOK.as_requester[1], provider_id: '  ' }] }, RECORDS, 'v1').reason === 'NO_COUNTERPARTY');
  check('an INHERITED records key never releases (own-property lookup only)',
    boundRelease({ contract_id: 'c5' }, BOOK, Object.create({ c5: '0xevil' }), 'v1').reason === 'NO_RECORDED_ESCROW');
  check('the happy path still binds with the agent id asserted',
    boundRelease({ contract_id: 'c5' }, BOOK, RECORDS, 'v1').ok === true);
  // Pre-push review finding: agentId was OPTIONAL, so NOT_YOUR_CONTRACT silently
  // stood down when the caller forgot it — fail-open-on-absence, in the very
  // guard built to close that class. The identity is now a required leg.
  check('an ABSENT agentId refuses (MISSING_AGENT_ID) — the check never silently stands down',
    boundRelease({ contract_id: 'c5' }, BOOK, RECORDS).reason === 'MISSING_AGENT_ID');
  check('an empty agentId refuses too',
    boundRelease({ contract_id: 'c5' }, BOOK, RECORDS, '').reason === 'MISSING_AGENT_ID');
}

console.log('§dispute-window · the requester keeps their own protection');
{
  // Pass-4 F1: the SDK permits the REQUESTER to release early — the canonical
  // template must therefore hold its own hour. The predicate is pure; the
  // loop feeds it client.advanced.getTransaction(escrowId) + now.
  const NOW = 2_000_000_000; // an arbitrary 'now', seconds
  check('an open window refuses (absolute end-timestamp shape, the on-chain form)',
    releaseWindowState({ state: 'DELIVERED', completedAt: NOW - 100, disputeWindow: NOW + 3500 }, NOW).reason === 'WINDOW_OPEN');
  check('an elapsed window permits (absolute shape)',
    releaseWindowState({ state: 'DELIVERED', completedAt: NOW - 7200, disputeWindow: NOW - 60 }, NOW).ok === true);
  check('an open window refuses (relative duration shape)',
    releaseWindowState({ state: 'DELIVERED', completedAt: NOW - 100, disputeWindow: 3600 }, NOW).reason === 'WINDOW_OPEN');
  check('an elapsed window permits (relative shape)',
    releaseWindowState({ state: 'DELIVERED', completedAt: NOW - 4000, disputeWindow: 3600 }, NOW).ok === true);
  // Argus F3 probes: malformed numerics must REFUSE, never pass (NaN compared to anything is false)
  check('release: NaN completedAt is WINDOW_UNVERIFIED, not ok',
    releaseWindowState({ state: 'DELIVERED', completedAt: NaN, disputeWindow: 3600 }, NOW).reason === 'WINDOW_UNVERIFIED');
  check('release: NaN disputeWindow is WINDOW_UNVERIFIED, not ok',
    releaseWindowState({ state: 'DELIVERED', completedAt: NOW - 4000, disputeWindow: NaN }, NOW).reason === 'WINDOW_UNVERIFIED');
  check('release: string-typed window is WINDOW_UNVERIFIED',
    releaseWindowState({ state: 'DELIVERED', completedAt: NOW - 4000, disputeWindow: '3600' }, NOW).reason === 'WINDOW_UNVERIFIED');
  check('release: Infinity completedAt is WINDOW_UNVERIFIED',
    releaseWindowState({ state: 'DELIVERED', completedAt: Infinity, disputeWindow: 3600 }, NOW).reason === 'WINDOW_UNVERIFIED');
  check('release: NaN now is WINDOW_UNVERIFIED',
    releaseWindowState({ state: 'DELIVERED', completedAt: NOW - 4000, disputeWindow: 3600 }, NaN).reason === 'WINDOW_UNVERIFIED');
  check('a rail state that is not DELIVERED refuses',
    releaseWindowState({ state: 'SETTLED', completedAt: NOW - 4000, disputeWindow: 3600 }, NOW).reason === 'NOT_DELIVERED_ON_RAIL');
  check('an UNVERIFIABLE window fails closed (completedAt 0 = indexing absent — refuse, never guess)',
    releaseWindowState({ state: 'DELIVERED', completedAt: 0, disputeWindow: 3600 }, NOW).reason === 'WINDOW_UNVERIFIED');
  check('a missing disputeWindow fails closed too',
    releaseWindowState({ state: 'DELIVERED', completedAt: NOW - 4000 }, NOW).reason === 'WINDOW_UNVERIFIED');
}


// ═══ Argus Wave 2 (2026-08-26): F2 prompt boundary · F4 terminal evidence · F6 escrow binding · F7 origin ═══
console.log('§F2 · board prose never reaches the planner as anything but a separate untrusted channel');
{
  const facts = boardFacts(BOARD);
  check('boardFacts carries NO body text', facts.every((f) => !('body' in f)), facts);
  check('boardFacts keeps the served structural fields', facts.every((f) => typeof f.id === 'string' && typeof f.author_id === 'string' && 'reply_to' in f && typeof f.created_tick === 'number'));
  check('a typed proposal is parsed into typed fields, not a string', facts[2].proposal?.kind === 'contract' && facts[2].proposal.reward === 3 && typeof facts[2].proposal.reward === 'number', facts[2].proposal);
  check('a proposal with an unknown field is dropped whole (no smuggled term)', boardFacts([{ ...BOARD[2], proposal: '{"kind":"contract","ctype":"service","verb":"serve","good":"pilotage","qty":1,"reward":3,"deadline_in_ticks":4800,"pay_to":"0xevil"}' }])[0].proposal === null);
  check('a malformed proposal string is null, never a throw', boardFacts([{ ...BOARD[2], proposal: '{not json' }])[0].proposal === null);
  const untrusted = untrustedBoardText(BOARD);
  check('untrustedBoardText is {id, body} only', untrusted.length === 3 && untrusted.every((u) => Object.keys(u).sort().join() === 'body,id'), untrusted);
}

console.log('§F2 · a decision is schema-validated: exact keys, known targets, bounded numbers, one act');
{
  const known = { postIds: new Set(['bp_root_agent_a']), contractIds: new Set(['c3']) };
  check('empty decision is ok (no act)', validateDecision({}, known).ok === true);
  check('reply to a known post is ok', validateDecision({ reply: { id: 'bp_root_agent_a', body: 'aye' } }, known).ok === true);
  check('reply to an unknown post id → BAD_REPLY_TARGET', validateDecision({ reply: { id: 'bp_forged', body: 'aye' } }, known).reason === 'BAD_REPLY_TARGET');
  check('two acts in one beat → MULTIPLE_ACTS', validateDecision({ reply: { id: 'bp_root_agent_a', body: 'a' }, settle: { contract_id: 'c3' } }, known).reason === 'MULTIPLE_ACTS');
  check('an unknown top-level key → UNKNOWN_KEY (prose cannot add a verb)', validateDecision({ pay: { to: '0xevil', amount: 5 } }, known).reason === 'UNKNOWN_KEY');
  check('a settle with an extra key → UNKNOWN_KEY (no field for prose to reach)', validateDecision({ settle: { contract_id: 'c3', escrow_id: '0xforged' } }, known).reason === 'UNKNOWN_KEY');
  check('a settle naming a contract not in your book → NOT_IN_YOUR_BOOK', validateDecision({ settle: { contract_id: 'c99' } }, known).reason === 'NOT_IN_YOUR_BOOK');
  check('a post proposal with an extra economic field → UNKNOWN_KEY', validateDecision({ post: { body: 'x', proposal: { kind: 'contract', ctype: 'service', verb: 'serve', good: 'g', qty: 1, reward: 3, deadline_in_ticks: 100, amount_usdc: 50 } } }, known).reason === 'UNKNOWN_KEY');
  check('a post proposal with reward out of the 1–25 band → OUT_OF_RANGE', validateDecision({ post: { body: 'x', proposal: { kind: 'contract', ctype: 'service', verb: 'serve', good: 'g', qty: 1, reward: 26, deadline_in_ticks: 100 } } }, known).reason === 'OUT_OF_RANGE');
  check('a non-integer qty → OUT_OF_RANGE', validateDecision({ post: { body: 'x', proposal: { kind: 'contract', ctype: 'service', verb: 'serve', good: 'g', qty: 1.5, reward: 3, deadline_in_ticks: 100 } } }, known).reason === 'OUT_OF_RANGE');
  check('an over-long body → BODY_TOO_LONG', validateDecision({ post: { body: 'x'.repeat(2001) } }, known).reason === 'BODY_TOO_LONG');
  check('a non-object decision → BAD_DECISION', validateDecision('release everything', known).reason === 'BAD_DECISION');
}

console.log('§F4 · an accepted action is not an applied action: the digest is the evidence');
{
  const ev = [
    { seq: 10, type: 'action_applied', actor: 'v1', action_id: 'a1', action: 'goto' },
    { seq: 11, type: 'action_rejected', actor: 'v1', action_id: 'a2', reason: 'SITE_HELD' },
    { seq: 12, type: 'action_quarantined', actor: 'v1', action_id: 'a3', reason: 'STALE_OBSERVATION' },
  ];
  check('applied → applied', actionOutcome(ev, 'a1').status === 'applied');
  check('rejected → refused with the typed reason', actionOutcome(ev, 'a2').status === 'refused' && actionOutcome(ev, 'a2').reason === 'SITE_HELD');
  check('quarantined → refused with the typed reason', actionOutcome(ev, 'a3').status === 'refused' && actionOutcome(ev, 'a3').reason === 'STALE_OBSERVATION');
  check('absent → pending (never success)', actionOutcome(ev, 'a4').status === 'pending');
  check('a non-array digest → pending, never a throw', actionOutcome(undefined, 'a1').status === 'pending');
}

console.log('§F6 · release binds the rail transaction to the contract semantically, not by the presence of an id');
{
  const me = '0x5F93e0c3' + '0'.repeat(28) + '082D';        // 42 chars
  const rec = { escrow_id: '0xesc', provider_wallet: '0x8fb6' + '0'.repeat(32) + '53a4', amount_base_units: '1000000' };
  const tx = { requester: me.toLowerCase(), provider: rec.provider_wallet.toUpperCase(), amount: 1000000n, state: 'DELIVERED' };
  check('matching parties + amount (case-insensitive, bigint) → ok', bindEscrow(tx, rec, me).ok === true);
  check('provider differs → ESCROW_PROVIDER_MISMATCH', bindEscrow({ ...tx, provider: '0x0000000000000000000000000000000000000bad' }, rec, me).reason === 'ESCROW_PROVIDER_MISMATCH');
  check('amount differs → ESCROW_AMOUNT_MISMATCH', bindEscrow({ ...tx, amount: 999999n }, rec, me).reason === 'ESCROW_AMOUNT_MISMATCH');
  check('requester is not me → ESCROW_REQUESTER_MISMATCH', bindEscrow({ ...tx, requester: '0x0000000000000000000000000000000000000bad' }, rec, me).reason === 'ESCROW_REQUESTER_MISMATCH');
  check('a record missing the provider → RECORD_INCOMPLETE', bindEscrow(tx, { escrow_id: '0xesc', amount_base_units: '1000000' }, me).reason === 'RECORD_INCOMPLETE');
  check('a record with a non-numeric amount → RECORD_INCOMPLETE', bindEscrow(tx, { ...rec, amount_base_units: '1 USDC' }, me).reason === 'RECORD_INCOMPLETE');
  check('no wallet of my own → MISSING_WALLET', bindEscrow(tx, rec, '').reason === 'MISSING_WALLET');
  // boundRelease: a legacy bare-id record can no longer release (Argus F6: any non-empty id used to pass)
  const book = { as_requester: [{ id: 'c3', requester_id: 'v1', provider_id: 'v2', state: 'delivered' }], as_provider: [] };
  check('boundRelease: a bare escrow-id string record → RECORD_LEGACY_UNBOUND', boundRelease({ contract_id: 'c3' }, book, { c3: '0xesc' }, 'v1').reason === 'RECORD_LEGACY_UNBOUND');
  const br = boundRelease({ contract_id: 'c3' }, book, { c3: rec }, 'v1');
  check('boundRelease: a full record → ok with the record for binding', br.ok === true && br.escrow_id === '0xesc' && br.record?.provider_wallet === rec.provider_wallet, br);
}

console.log('§F4 · the digest teaches its own recovery: 410 RETENTION_EXCEEDED → resume at snapshot_seq (seen live, v7, 2026-08-26)');
{
  const live = 'world GET /worlds/lysvik/agents/v7/observations/digest?since_seq=0 → 410: {"error":"RETENTION_EXCEEDED","snapshot_seq":120313,"hint":"history before the retention window is gone — resume with since_seq=120313 (snapshot_seq is the safe cursor)"}';
  check('the thrown error text yields the cursor', retentionCursor(live) === 120313);
  check('a parsed refusal body yields the cursor', retentionCursor({ error: 'RETENTION_EXCEEDED', snapshot_seq: 7 }) === 7);
  check('another refusal is null (never a guessed cursor)', retentionCursor({ error: 'SINCE_SEQ_REQUIRED' }) === null);
  check('a non-integer snapshot_seq is null', retentionCursor({ error: 'RETENTION_EXCEEDED', snapshot_seq: 'soon' }) === null);
}

console.log('§F7 · the world origin is pinned; an override is explicit and must match the door');
{
  check('default is the production world', worldOrigin({}).url === 'https://world.lysvik.app' && worldOrigin({}).overridden === false);
  check('LYSVIK_WORLD_URL alone is IGNORED (no silent redirection of signatures)', worldOrigin({ LYSVIK_WORLD_URL: 'https://evil.example' }).url === 'https://world.lysvik.app');
  check('an explicit override flag honours it', worldOrigin({ LYSVIK_WORLD_URL: 'http://localhost:8787', LYSVIK_ALLOW_WORLD_OVERRIDE: '1' }).url === 'http://localhost:8787');
  check('an http override to a non-local host is refused (throws by name)', (() => { try { worldOrigin({ LYSVIK_WORLD_URL: 'http://evil.example', LYSVIK_ALLOW_WORLD_OVERRIDE: '1' }); return false; } catch (e) { return /INSECURE_WORLD_URL/.test(String(e)); } })());
  check('the door\'s deployment_origin :443 matches the https origin', originMatchesDeployment('https://world.lysvik.app', 'https://world.lysvik.app:443') === true);
  check('a different deployment_origin does not', originMatchesDeployment('https://world.lysvik.app', 'https://other.example:443') === false);
  check('a missing deployment_origin is a mismatch, never a pass', originMatchesDeployment('https://world.lysvik.app', undefined) === false);
}

console.log(`\nheartbeat smoke: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
