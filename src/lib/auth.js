import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.credits = user.credits;
        session.user.role = user.role;
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