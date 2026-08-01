import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { provisionNewUser } from "@/lib/auth-events";

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
      // userCount is read AFTER the row is created (unlike the register
      // route's pre-create count), so the first-ever user lands at count 1.
      const userCount = await prisma.user.count();
      await provisionNewUser(user.id, { firstUserAdmin: userCount === 1 });
    },
  },
});
