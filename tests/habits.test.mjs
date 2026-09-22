import assert from 'node:assert/strict';
import test from 'node:test';
import { bestStrategy, coachReply, earnedXP, groupRates, makePlan, phoneInsight, tinyStep } from '../lib/habits.ts';

const habit = { id: 'focus', name: 'Stop procrastinating', type: 'break', cue: 'A difficult assignment', behavior: 'Open YouTube on my phone', reward: 'A short break', barrier: 'It feels overwhelming', time: '7 PM', firstStep: 'Open the assignment.', createdAt: '2026-09-01' };
const entry = (date, status = 'completed', extra = {}) => ({ id: `focus:${date}`, habitId: 'focus', date, status, phone: 'away', strategy: '5-minute start', trigger: habit.cue, hour: 19, minutes: 5, note: '', ...extra });

test('build and break use the correct four-rule plans', () => {
  assert.deepEqual(makePlan({ ...habit, type: 'build' }).map(p => p.rule), ['Make it obvious', 'Make it attractive', 'Make it easy', 'Make it satisfying']);
  assert.deepEqual(makePlan(habit).map(p => p.rule), ['Make it invisible', 'Make it unattractive', 'Make it difficult', 'Make it unsatisfying']);
});

test('breaking a drink habit does not suggest taking a sip of it', () => {
  assert.match(tinyStep('Stop drinking soda', 'break'), /water instead/);
  assert.match(tinyStep('Drink more water', 'build'), /take one sip/);
});

test('strategy recommendations require evidence and use successes over attempts', () => {
  assert.equal(bestStrategy([entry('2026-09-01'), entry('2026-09-02')]), null);
  const logs = [entry('2026-09-01'), entry('2026-09-02'), entry('2026-09-03', 'missed'), ...[4, 5, 6].map(d => entry(`2026-09-0${d}`, 'completed', { strategy: 'Phone away' }))];
  const best = bestStrategy(logs);
  assert.equal(best.name, 'Phone away');
  assert.equal(best.n, 3);
  assert.equal(best.wins, 3);
});

test('phone comparisons need five observations in both groups', () => {
  const away = Array.from({ length: 5 }, (_, i) => entry(`2026-09-0${i + 1}`, i < 4 ? 'completed' : 'missed'));
  const near = Array.from({ length: 5 }, (_, i) => entry(`2026-09-${i + 10}`, i < 2 ? 'completed' : 'missed', { phone: 'nearby' }));
  assert.equal(phoneInsight([...away, ...near.slice(0, 4)]).ready, false);
  assert.deepEqual(phoneInsight([...away, ...near]), { awayN: 5, nearN: 5, awayRate: 80, nearRate: 40, ready: true });
});

test('XP rewards recovery only for the same habit after a missed day', () => {
  const missed = entry('2026-09-01', 'missed');
  const completed = entry('2026-09-02');
  assert.equal(earnedXP([missed, completed], [habit]), 40);
  assert.equal(earnedXP([{ ...missed, habitId: 'other' }, completed], [habit]), 30);
});

test('rates use logged attempts and preserve the 8 PM boundary', () => {
  const rates = groupRates([entry('2026-09-01', 'completed', { hour: 19 }), entry('2026-09-02', 'missed', { hour: 20 })], 'time');
  assert.equal(rates[2].rate, 100);
  assert.equal(rates[3].rate, 0);
  assert.equal(rates[3].n, 1);
});

test('coach paragraphs contain real line breaks', () => {
  const reply = coachReply(habit, [], 'I cannot start');
  assert.ok(reply.includes('\n\n'));
  assert.ok(!reply.includes('\\n'));
  assert.match(reply, /Open the assignment/);
});
