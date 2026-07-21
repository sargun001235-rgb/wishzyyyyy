"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { createAdminSession, clearAdminSession } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginResult = { success: true } | { success: false; error: string };

export async function adminLogin(input: {
  email: string;
  password: string;
}): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Enter a valid email and password." };
  }

  const configuredEmail = process.env.ADMIN_EMAIL;
  const configuredHash = process.env.ADMIN_PASSWORD_HASH;

  if (!configuredEmail || !configuredHash) {
    console.error("[admin-auth] ADMIN_EMAIL / ADMIN_PASSWORD_HASH not configured");
    return { success: false, error: "Admin login is not configured." };
  }

  if (parsed.data.email.toLowerCase() !== configuredEmail.toLowerCase()) {
    // Generic error -- never reveal whether the email exists.
    return { success: false, error: "Invalid email or password." };
  }

  let passwordMatches = false;
  try {
    passwordMatches = await bcrypt.compare(parsed.data.password, configuredHash);
  } catch (err) {
    console.error("[admin-auth] bcrypt comparison failed", err);
    return { success: false, error: "Something went wrong. Please try again." };
  }

  if (!passwordMatches) {
    return { success: false, error: "Invalid email or password." };
  }

  try {
    await createAdminSession(configuredEmail);
    return { success: true };
  } catch (err) {
    console.error("[admin-auth] failed to create session", err);
    return { success: false, error: "Couldn't sign you in. Please try again." };
  }
}

export async function adminLogout() {
  clearAdminSession();
}
