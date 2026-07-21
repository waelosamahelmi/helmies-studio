export const CREDIT_PACKS = [
  { id: "500", name: "500 Credits", price: "€9", credits: 500, pricePerCredit: "€0.018/credit" },
  { id: "1000", name: "1000 Credits", price: "€16", credits: 1000, pricePerCredit: "€0.016/credit" },
  { id: "2500", name: "2500 Credits", price: "€35", credits: 2500, pricePerCredit: "€0.014/credit" },
  { id: "5000", name: "5000 Credits", price: "€60", credits: 5000, pricePerCredit: "€0.012/credit" },
];

export function getCreditPackPriceId(packId) {
  const map = {
    "500": process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_500,
    "1000": process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_1000,
    "2500": process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_2500,
    "5000": process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_5000,
  };
  return map[packId];
}
