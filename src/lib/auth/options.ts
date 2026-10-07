import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

const credentialsSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(1).optional(),
  restaurantSlug: z.string().min(1).optional(),
  password: z.string().min(1)
});

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        username: { label: "Tên đăng nhập", type: "text" },
        restaurantSlug: { label: "Restaurant", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = parsed.data.restaurantSlug && parsed.data.username
          ? (await prisma.restaurantUser.findFirst({
              where: {
                username: parsed.data.username.trim().toLowerCase(),
                isActive: true,
                restaurant: { slug: parsed.data.restaurantSlug, status: "ACTIVE" },
                user: { isActive: true }
              },
              select: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    passwordHash: true,
                    platformRole: true,
                    isActive: true
                  }
                }
              }
            }))?.user
          : parsed.data.email
            ? await prisma.user.findUnique({
                where: { email: parsed.data.email },
                select: {
                  id: true,
                  name: true,
                  email: true,
                  passwordHash: true,
                  platformRole: true,
                  isActive: true
                }
              })
            : null;

        if (!user?.isActive) {
          return null;
        }

        const isValidPassword = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!isValidPassword) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          platformRole: user.platformRole
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.platformRole = user.platformRole;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.platformRole = token.platformRole;
      }
      return session;
    }
  }
};
