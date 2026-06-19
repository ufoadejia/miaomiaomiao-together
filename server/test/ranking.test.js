import test from 'node:test';
import assert from 'node:assert/strict';
import { sortRankedDishes } from '../src/ranking.js';

test('ranking favors average score, rating count, and recency', () => {
  const now = new Date('2026-05-20T00:00:00Z');
  const dishes = [
    { id: 'old', avgScore: 4.5, ratingCount: 4, lastRatedAt: '2026-01-01T00:00:00Z' },
    { id: 'top', avgScore: 4.8, ratingCount: 10, lastRatedAt: '2026-05-19T00:00:00Z' },
    { id: 'few', avgScore: 4.8, ratingCount: 1, lastRatedAt: '2026-05-19T00:00:00Z' }
  ];

  const ranked = sortRankedDishes(dishes, now);
  assert.equal(ranked[0].id, 'top');
  assert.equal(ranked[1].id, 'few');
});
