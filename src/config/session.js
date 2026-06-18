import session from "express-session";
import { PrismaSessionStore } from "@quixo3/prisma-session-store";
import prisma from "./db.js";

// Sesión compartida entre Express y Socket.IO. Se importa desde ambos
// para que el handshake del socket pueda leer la cookie de sesión.
export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "cambiame123",
  resave: false,
  saveUninitialized: false,
  store: new PrismaSessionStore(prisma, {
    checkPeriod: 2 * 60 * 1000,
    dbRecordIdIsSessionId: true,
    dbRecordIdFunction: undefined,
  }),
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
  },
});
