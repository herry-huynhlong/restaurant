import type { NextAuthOptions } from "next-auth";
import type { PlatformRole, RestaurantRole, RestaurantStatus } from "@prisma/client";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { normalizeUsername } from "@/lib/username";

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

        const loginContext = parsed.data.restaurantSlug && parsed.data.username
          ? await getTenantLoginContext(parsed.data.restaurantSlug, parsed.data.username)
          : null;
        if (loginContext && !loginContext.user) {
          return null;
        }

        const user = loginContext?.user
          ?? (parsed.data.email
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
            : null);

        if (!user?.isActive) {
          if (loginContext) logTenantLoginAttempt(loginContext, false, "USER_INACTIVE");
          return null;
        }

        const isValidPassword = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!isValidPassword) {
          if (loginContext) logTenantLoginAttempt(loginContext, false, "BAD_PASSWORD");
          return null;
        }

        if (loginContext) logTenantLoginAttempt(loginContext, true, "OK");

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

type TenantLoginContext = {
  slug: string;
  submittedUsername: string;
  normalizedUsername: string;
  restaurantFound: boolean;
  restaurantStatus: RestaurantStatus | null;
  membershipFound: boolean;
  membershipUsername: string | null;
  role: RestaurantRole | null;
  membershipActive: boolean | null;
  userActive: boolean | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    passwordHash: string;
    platformRole: PlatformRole;
    isActive: boolean;
  } | null;
};

async function getTenantLoginContext(restaurantSlug: string, submittedUsername: string) {
  const normalizedUsername = normalizeUsername(submittedUsername);
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug },
    select: { id: true, slug: true, status: true }
  });
  const membership = restaurant
    ? await prisma.restaurantUser.findFirst({
      where: {
        restaurantId: restaurant.id,
        username: normalizedUsername
      },
      select: {
        username: true,
        role: true,
        isActive: true,
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
    })
    : null;

  const user = restaurant?.status === "ACTIVE" && membership?.isActive && membership.user.isActive
    ? membership.user
    : null;

  const context: TenantLoginContext = {
    slug: restaurantSlug,
    submittedUsername,
    normalizedUsername,
    restaurantFound: Boolean(restaurant),
    restaurantStatus: restaurant?.status ?? null,
    membershipFound: Boolean(membership),
    membershipUsername: membership?.username ?? null,
    role: membership?.role ?? null,
    membershipActive: membership?.isActive ?? null,
    userActive: membership?.user.isActive ?? null,
    user
  };

  if (!user) {
    logTenantLoginAttempt(context, false, !restaurant ? "RESTAURANT_NOT_FOUND" : !membership ? "MEMBERSHIP_NOT_FOUND" : restaurant.status !== "ACTIVE" ? "RESTAURANT_LOCKED" : !membership.isActive ? "MEMBERSHIP_INACTIVE" : "USER_INACTIVE");
  }

  return context;
}

function logTenantLoginAttempt(
  context: TenantLoginContext,
  passwordValid: boolean,
  result: string
) {
  console.info("LOGIN_ATTEMPT", {
    slug: context.slug,
    submittedUsername: context.submittedUsername,
    normalizedUsername: context.normalizedUsername,
    restaurantFound: context.restaurantFound,
    restaurantStatus: context.restaurantStatus,
    membershipFound: context.membershipFound,
    membershipUsername: context.membershipUsername,
    role: context.role,
    membershipActive: context.membershipActive,
    userActive: context.userActive,
    passwordValid,
    deviceCheckApplied: false,
    result
  });
}
