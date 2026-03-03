import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { authRouter } from "./routes/auth.js";
import { actuarialRouter } from "./routes/actuarial.js";
import { reportRouter } from "./routes/report.js";

const app = express();

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: "Too many requests" },
  })
);
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.use("/auth", authRouter);
app.use("/", actuarialRouter);
app.use("/", reportRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
