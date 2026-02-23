import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { sendVerificationEmail } from "../lib/mailer";

const prisma = new PrismaClient();
const router = Router();

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

function generateJwt(user: { id: string; email: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be configured in production");
  }
  return jwt.sign(
    { sub: user.id, email: user.email },
    secret || "change-me",
    { expiresIn: "7d" }
  );
}

router.post("/register", async (req, res) => {
  const parse = authSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parse.error.flatten().fieldErrors
    });
  }

  const { email, password } = parse.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const hash = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.user.create({
    data: {
      email,
      password: hash,
      verificationToken,
      verificationTokenExpiry
    }
  });

  try {
    await sendVerificationEmail(email, verificationToken);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to send verification email:", err);
    return res.status(502).json({ error: "Account created but failed to send verification email. Contact support." });
  }

  return res.status(201).json({ message: "Verification email sent. Please check your inbox." });
});

router.post("/login", async (req, res) => {
  const parse = authSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parse.error.flatten().fieldErrors
    });
  }

  const { email, password } = parse.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (!user.emailVerified) {
    return res.status(403).json({
      error: "Please verify your email before logging in.",
      code: "EMAIL_NOT_VERIFIED"
    });
  }

  return res.json({ token: generateJwt(user) });
});

router.get("/verify-email", async (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.status(400).json({ error: "Verification token is required" });
  }

  const user = await prisma.user.findUnique({ where: { verificationToken: token } });

  if (!user) {
    return res.status(400).json({ error: "Invalid or expired verification token" });
  }

  if (user.verificationTokenExpiry && user.verificationTokenExpiry < new Date()) {
    return res.status(400).json({ error: "Verification token has expired. Please register again." });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verificationToken: null,
      verificationTokenExpiry: null
    }
  });

  return res.json({ token: generateJwt(user) });
});

router.post("/resend-verification", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.emailVerified) {
    // Don't leak whether the email exists
    return res.json({ message: "If that email exists and is unverified, a new link has been sent." });
  }

  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { verificationToken, verificationTokenExpiry }
  });

  try {
    await sendVerificationEmail(email, verificationToken);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to resend verification email:", err);
    return res.status(502).json({ error: "Failed to send email. Please try again later." });
  }

  return res.json({ message: "If that email exists and is unverified, a new link has been sent." });
});

export default router;
