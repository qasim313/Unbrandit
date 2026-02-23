import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { json, urlencoded } from "body-parser";
import authRouter from "./routes/auth";
import projectRouter from "./routes/projects";
import buildRouter from "./routes/builds";
import uploadRouter from "./routes/uploads";
import internalRouter from "./routes/internal";
import sourceRouter from "./routes/source";
import { initQueues } from "./queue/init";
import { authMiddleware } from "./middleware/auth";
import rateLimit from "express-rate-limit";

const app = express();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN || "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  socket.on("subscribeBuild", (buildId: string) => {
    socket.join(buildId);
  });
  socket.on("subscribeProject", (projectId: string) => {
    socket.join(projectId);
  });
});

app.set("io", io);

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "*",
    credentials: true
  })
);
app.use(morgan("combined"));
app.use(json({ limit: "10mb" }));
app.use(urlencoded({ extended: true }));

app.use("/internal", internalRouter);
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Apply rate limiting to all API routes
app.use("/api", limiter);
app.use("/api/auth", authRouter);
app.use("/api", authMiddleware);

app.use("/api/projects", projectRouter);
app.use("/api/builds", buildRouter);
app.use("/api/uploads", uploadRouter);
app.use("/api/source", sourceRouter);

const port = process.env.PORT || 4000;

async function start() {
  await initQueues();
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend API listening on port ${port}`);
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start backend", err);
  process.exit(1);
});

