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
 * keys (S100 walk-in thread, ids shortened); the challenge mirrors the live
 * door's. If the server's shape moves, regenerate the contract and update
 * these together — the gate will insist.
 */
import { deriveReplyDebt, modeForChain, permittedValueAction } from './heartbeat-lib.mjs';

let passed = 0;
let failed = 0;
const check = (name, cond, detail) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); }
};

// ── fixture: the moot's served row shape (author_id + reply_to, post ids) ───
const BOARD = [
  { id: 'bp_root_atlas', author_id: 'v1', reply_to: null, created_tick: 81620, proposal: null,
    body: 'Nex — reply on this exact edge with the contract ID and one place worth visiting.' },
  { id: 'bp_reply_nex', author_id: 'v2', reply_to: 'bp_root_atlas', created_tick: 110677, proposal: null,
    body: 'c3, 1× scribe_commission — and try the harbour: the striped-sail knarr is worth the walk.' },
  { id: 'bp_reply_atlas', author_id: 'v1', reply_to: 'bp_reply_nex', created_tick: 111401,
    proposal: '{"kind":"contract","ctype":"service","verb":"serve","good":"pilotage","qty":1,"reward":3,"deadline_in_ticks":4800,"proposal_id":"pr_a92f"}',
    body: 'Turning your harbour instinct into work: one pilotage return-path brief.' },
];

console.log('§reply-debt · derived from SERVED fields only');
{
  // From Atlas's seat: Nex's reply is ANSWERED (bp_reply_atlas) — no debt.
  check('an answered reply is not owed', deriveReplyDebt(BOARD, 'v1').length === 0, deriveReplyDebt(BOARD, 'v1'));
  // From Nex's seat: Atlas's bp_reply_atlas replies to Nex's post, unanswered — owed.
  const owedToNex = deriveReplyDebt(BOARD, 'v2');
  check('an unanswered reply to your post IS owed', owedToNex.length === 1 && owedToNex[0].id === 'bp_reply_atlas', owedToNex);
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
}

console.log(`\nheartbeat smoke: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
