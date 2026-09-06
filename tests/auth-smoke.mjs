// Optional smoke test against a disposable confirmed Auth account.
// Create .verification-account.json with { email, password }, then delete it afterwards.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => line.startsWith('NEXT_PUBLIC_')).map(line => { const pos = line.indexOf('='); return [line.slice(0, pos), line.slice(pos + 1).replace(/^"|"$/g, '')]; }));
const credentials = JSON.parse(fs.readFileSync('.verification-account.json', 'utf8'));
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let goalId;
let eventId;
let userId;
try {
  const { data, error } = await client.auth.signInWithPassword({ email: credentials.email, password: credentials.password });
  assert.equal(error, null, 'Password login succeeds');
  userId = data.user.id;
  const profile = await client.from('profiles').upsert({ id: userId, display_name: 'Temporary verification', start_year: 2024, start_month: 9 }).select().single();
  assert.equal(profile.error, null, 'Profile saves through REST');
  const created = await client.from('goals').insert({ user_id: userId, title: 'Disposable verification goal', deadline: '2026-12-01', progress: 10 }).select().single();
  assert.equal(created.error, null, 'Goal insert succeeds'); goalId = created.data.id;
  const updated = await client.from('goals').update({ progress: 100, completed_on: '2026-09-06' }).eq('id', goalId).select().single();
  assert.equal(updated.error, null, 'Goal completion succeeds');
  const history = await client.from('activities').select('*').eq('goal_id', goalId);
  assert.equal(history.error, null); assert.equal(history.data.length, 2); assert.equal(history.data.filter(a => a.kind === 'completion').length, 1);
  const event = await client.from('activities').insert({ user_id: userId, title: 'Disposable journal entry', occurred_on: '2026-09-05', kind: 'event' }).select().single();
  assert.equal(event.error, null); eventId = event.data.id;
  const edited = await client.from('activities').update({ title: 'Edited journal entry' }).eq('id', eventId).select().single();
  assert.equal(edited.error, null); assert.equal(edited.data.title, 'Edited journal entry');
  assert.equal((await client.auth.refreshSession()).error, null, 'Session refresh succeeds');
  assert.equal((await client.auth.getUser()).error, null, 'Auth user remains valid');
  console.log('PASS: Auth login, profile, REST goal CRUD, atomic completion history, journal CRUD and session refresh.');
} finally {
  if (goalId) await client.from('goals').delete().eq('id', goalId);
  if (userId) { await client.from('activities').delete().eq('user_id', userId); await client.from('profiles').delete().eq('id', userId); }
  await client.auth.signOut();
}
