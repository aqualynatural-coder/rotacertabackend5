import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import path from "path";
import fs from "fs";
import { rateLimit } from "express-rate-limit";

import { errorHandler } from "./middleware/errorHandler";
import { registerSockets } from "./sockets";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import driverRoutes from "./routes/driver.routes";
import customerRoutes from "./routes/customer.routes";
import routeRoutes from "./routes/route.routes";
import deliveryRoutes from "./routes/delivery.routes";
import locationRoutes from "./routes/location.routes";
import reportRoutes from "./routes/report.routes";
import notificationRoutes from "./routes/notification.routes";

const app = express();
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(",") ?? "*",
    credentials: true,
  },
});

// Expose io on request
app.set("io", io);

// Middleware base
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? "*",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Rate limit para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
});

// Upload dir estático
const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));

// Health
app.get("/health", (_req, res) => res.json({ ok: true, service: "rotacerta", ts: new Date() }));

// Rotas
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/deliveries", deliveryRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);

// Error handler
app.use(errorHandler);

// Socket.IO
registerSockets(io);

const PORT = Number(process.env.PORT ?? 4000);
httpServer.listen(PORT, () => {
  console.log(`🚚 RotaCerta API rodando em http://localhost:${PORT}`);
  console.log(`🛰️  Socket.IO ativo`);
});
