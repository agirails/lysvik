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
import { boundRelease, cursorFromDigest, deriveReplyDebt, modeForChain, permittedValueAction, releaseWindowState } from './heartbeat-lib.mjs';

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
  const RECORDS = { c5: '0xesc5' };

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
  check('a rail state that is not DELIVERED refuses',
    releaseWindowState({ state: 'SETTLED', completedAt: NOW - 4000, disputeWindow: 3600 }, NOW).reason === 'NOT_DELIVERED_ON_RAIL');
  check('an UNVERIFIABLE window fails closed (completedAt 0 = indexing absent — refuse, never guess)',
    releaseWindowState({ state: 'DELIVERED', completedAt: 0, disputeWindow: 3600 }, NOW).reason === 'WINDOW_UNVERIFIED');
  check('a missing disputeWindow fails closed too',
    releaseWindowState({ state: 'DELIVERED', completedAt: NOW - 4000 }, NOW).reason === 'WINDOW_UNVERIFIED');
}

// The first-digest 410 path (observed 2026-08-26, body v7): the cursor is snapshot_seq.
check('first digest 410 RETENTION_EXCEEDED → cursor = snapshot_seq', cursorFromDigest(410, { error: 'RETENTION_EXCEEDED', snapshot_seq: 119896 }) === 119896);
check('normal 200 → cursor = latest_seq', cursorFromDigest(200, { latest_seq: 119898, events: [] }) === 119898);
check('anything else is not a cursor (throws, never guesses)', (() => { try { cursorFromDigest(422, { error: 'SINCE_SEQ_REQUIRED' }); return false; } catch { return true; } })());

console.log(`\nheartbeat smoke: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
