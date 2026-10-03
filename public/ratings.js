// Seller star ratings (1 to 5) from shoppers' reviews.
export function ratingOf(reviews, sellerId) {
  const rs = reviews.filter((r) => r.sellerId === sellerId);
  return { n: rs.length, avg: rs.length ? rs.reduce((a, r) => a + (r.stars || 0), 0) / rs.length : 0 };
}
export const ratingText = ({ avg, n }) => n ? `★ ${avg.toFixed(1)} (${n} rating${n === 1 ? "" : "s"})` : "No ratings yet";
export const starString = (n) => "★".repeat(n) + "☆".repeat(5 - n);
