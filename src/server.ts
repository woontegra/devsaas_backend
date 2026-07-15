import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { authRouter } from "./routes/auth.js";
import { actuarialRouter } from "./routes/actuarial.js";
import { reportRouter } from "./routes/report.js";
import { calculationsRouter } from "./routes/calculations.js";
import { resolveJwtSecret } from "./middleware/authMiddleware.js";

const nodeEnv = process.env.NODE_ENV ?? "development";

// Production'da JWT_SECRET zorunlu — uygulama başlamasın
try {
  resolveJwtSecret();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Server-to-server / same-origin tools may omit Origin
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests" },
  })
);

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Try again later." },
});

app.use(express.json({ limit: "1mb" }));

app.use("/auth", authRateLimit, authRouter);
app.use("/calculations", calculationsRouter);
app.use("/", actuarialRouter);
app.use("/", reportRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Generic error handler — stack trace döndürme
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const msg = err instanceof Error ? err.message : "Server error";
    if (msg === "Not allowed by CORS") {
      res.status(403).json({ error: "CORS origin not allowed" });
      return;
    }
    if (nodeEnv !== "production") {
      console.error("[error]", msg);
    }
    res.status(500).json({ error: "Internal server error" });
  }
);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
