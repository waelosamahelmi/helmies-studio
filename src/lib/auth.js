import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  // Credentials provider requires JWT sessions; PrismaAdapter stays for Google OAuth accounts.
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      // On sign-in `user` is present; persist identity claims into the token.
      if (user) {
        token.id = user.id;
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true, credits: true },
        });
        token.role = dbUser?.role ?? "user";
        token.credits = dbUser?.credits ?? 0;
      } else if (token.id) {
        // Keep credits/role fresh on subsequent requests.
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: { role: true, credits: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          token.credits = dbUser.credits;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id;
        session.user.credits = token.credits;
        session.user.role = token.role;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      const userCount = await prisma.user.count();
      const role = userCount === 1 ? "admin" : "user";
      await prisma.user.update({ where: { id: user.id }, data: { role } });
      await prisma.subscription.create({
        data: { userId: user.id, plan: "free", status: "active" },
      });
      // CreditWallet only has available/reserved/lifetime — no lifetimeCredited/lifetimeDebited.
      await prisma.creditWallet.create({
        data: { userId: user.id, available: 100, lifetime: 100 },
      });
      await prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount: 100,
          type: "signup_bonus",
          description: "Welcome bonus: 100 free credits",
        },
      });
    },
  },
});
