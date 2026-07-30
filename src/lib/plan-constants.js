// Plan constants — NO Prisma/DB imports.
// Safe for both server and client component import.
// Single source of truth for subscription plans and credit amounts.

export const SUBSCRIPTION_CREDITS = {
  free: 100,
  starter: 1000,
  studio: 3000,
  pro: 10000,
};

export const PLAN_IDS = {
  [process.env.STRIPE_PRICE_STARTER]: "starter",
  [process.env.STRIPE_PRICE_STUDIO]: "studio",
  [process.env.STRIPE_PRICE_PRO]: "pro",
};

export const PLAN_NAMES = {
  free: "Free",
  starter: "Starter",
  studio: "Studio",
  pro: "Pro",
};

export const PLAN_DESCRIPTIONS = {
  free: "100 credits/mo — perfect for trying it out",
  starter: "1,000 credits/mo — for hobbyists",
  studio: "3,000 credits/mo — for creators",
  pro: "10,000 credits/mo — for professionals",
};

// Re-exported for backward compatibility from credits.js
export const CREDIT_COSTS = {
  image: { default: 2 },
  i2i: { default: 3 },
  video: { default: 10 },
  i2v: { default: 12 },
  v2v: { default: 8 },
  lipsync: { default: 8 },
  audio: { default: 5 },
  recast: { default: 12 },
  cinema: { default: 4 },
  motion: { default: 8 },
  clipping: { default: 6 },
  marketing: { default: 15 },
  influencer: { default: 3 },
};
