export function rankScore(dish, now = new Date()) {
  const avg = Number(dish.avgScore || 0);
  const count = Number(dish.ratingCount || 0);
  const lastRatedAt = dish.lastRatedAt ? new Date(dish.lastRatedAt) : null;
  const daysSinceActive = lastRatedAt
    ? Math.max(0, (now.getTime() - lastRatedAt.getTime()) / 86400000)
    : 365;
  const recency = Math.max(0, 1 - daysSinceActive / 30);

  return avg * 100 + Math.log1p(count) * 18 + recency * 12;
}

export function sortRankedDishes(dishes, now = new Date()) {
  return [...dishes]
    .map((dish) => ({ ...dish, rankScore: rankScore(dish, now) }))
    .sort((a, b) => (
      b.rankScore - a.rankScore ||
      Number(b.avgScore || 0) - Number(a.avgScore || 0) ||
      Number(b.ratingCount || 0) - Number(a.ratingCount || 0) ||
      new Date(b.lastRatedAt || b.updatedAt || 0) - new Date(a.lastRatedAt || a.updatedAt || 0)
    ));
}
