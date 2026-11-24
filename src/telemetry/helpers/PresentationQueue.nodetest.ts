import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PresentationQueue } from './PresentationQueue';

test('continuous telemetry flushes at a fixed cadence with latest work per key', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const shown: number[] = [];
    const queue = new PresentationQueue(100);
    for (let i = 0; i < 100; i++) queue.schedule('position', () => shown.push(i));
    t.mock.timers.tick(99);
    assert.equal(shown.length, 0);
    queue.schedule('position', () => shown.push(100));
    t.mock.timers.tick(1);
    assert.deepEqual(shown, [100]);
    queue.schedule('position', () => shown.push(101));
    t.mock.timers.tick(100);
    assert.deepEqual(shown, [100, 101]);
});

test('independent fields survive coalescing; ingestion is immediate and complete', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const queue = new PresentationQueue(100);
    const shown = new Map<string, number>();
    let ingested = 0;
    for (let i = 0; i < 1000; i++) {
        ingested++;
        const field = ['position', 'sog', 'cog', 'depth', 'wind'][i % 5];
        queue.schedule(field, () => { shown.set(field, i); });
    }
    assert.equal(ingested, 1000);
    assert.equal(shown.size, 0);
    t.mock.timers.tick(100);
    assert.deepEqual([...shown.values()], [995, 996, 997, 998, 999]);
});

test('cleanup cancels pending work and the same queue can be reused after remount', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const queue = new PresentationQueue(100);
    const applied: string[] = [];
    queue.schedule('motion', () => applied.push('old vessel'));
    queue.cancel();
    t.mock.timers.tick(100);
    assert.equal(applied.length, 0);
    queue.schedule('motion', () => applied.push('new vessel'));
    t.mock.timers.tick(100);
    assert.deepEqual(applied, ['new vessel']);
});

test('one presentation batch per burst; reentrant notifications wait for the next batch', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let batches = 0, applied = 0;
    const queue = new PresentationQueue(100, flush => { batches++; flush(); });
    queue.schedule('motion', () => {
        applied++;
        queue.schedule('motion', () => { applied++; });
    });
    queue.schedule('depth', () => { applied++; });
    t.mock.timers.tick(100);
    assert.equal(batches, 1); assert.equal(applied, 2);
    t.mock.timers.tick(100);
    assert.equal(batches, 2); assert.equal(applied, 3);
});
