import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoverMotion } from '../src/ui/coverMotion.ts';

const finish = (m: CoverMotion, hz = 60) => {
  for (let i = 0; m.active && i < hz * 5; i++) m.tick(1 / hz);
  assert.equal(m.active, false, 'settles within five seconds');
  assert.equal(m.position, Math.round(m.position), 'lands on a cover');
};
test('a swipe coasts past release and snaps at different refresh rates', () => {
  const ends = [];
  for (const hz of [30, 60, 120]) {
    const m = new CoverMotion(); m.begin(10, 40, 0); m.move(11, 100); m.move(12, 200); m.release(200);
    m.tick(1 / hz); assert.ok(m.position > 12);
    finish(m, hz); ends.push(m.position);
  }
  assert.deepEqual(ends, [14, 14, 14]);
});
test('reverse swipes, library boundaries and a single cover', () => {
  for (const [start, count, to] of [[10,40,9],[0,40,-5],[39,40,45],[0,1,5]]) {
    const m = new CoverMotion(); m.begin(start,count,0);m.move(to,100);m.release(100);finish(m);
    assert.ok(m.position >= 0 && m.position < count);
    if (count === 1) assert.equal(m.position, 0);
  }
});
test('paused finger stops the fling; reduced motion snaps immediately; cancellation stops', () => {
  const m = new CoverMotion();m.begin(3,20,0);m.move(4.2,100);m.release(300);finish(m);assert.equal(m.position,4);
  m.begin(3,20,0);m.move(5.6,100);m.release(100,true);assert.equal(m.active,false);assert.equal(m.position,6);
  m.begin(3,20,0);m.move(4,100);m.stop();assert.equal(m.tick(0.1),false);assert.equal(m.position,4);
});
