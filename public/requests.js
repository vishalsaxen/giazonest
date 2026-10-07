// Orders and enquiries a shopper sends a seller, kept at requests/{id}.
// Each one carries a 6-digit OTP that both sides see: the shopper quotes it when they
// talk to the seller, and the seller confirms the request only if the codes match.
export const newOtp = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
export const REQUEST_CHIP = { Pending: "warn", Confirmed: "ok", Rejected: "bad", Cancelled: "bad" };
export const whenText = (t) => t?.seconds
  ? new Date(t.seconds * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "just now";
export const requestWhat = (r) => r.kind === "Order"
  ? `Order: ${r.qty} × ${r.productName}`
  : `Enquiry${r.productName ? `: ${r.productName}` : ""}`;
const secs = (r) => r.createdAt?.seconds ?? Date.now() / 1000;
export const byNewest = (a, b) => secs(b) - secs(a);
