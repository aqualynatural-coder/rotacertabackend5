import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";

interface AuthPayload {
  id: string;
  email: string;
  role: Role;
}

export function registerSockets(io: SocketIOServer) {
  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Token ausente"));
    try {
      const payload = jwt.verify(String(token), process.env.JWT_SECRET!) as AuthPayload;
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error("Token inválido"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const user = (socket as any).user as AuthPayload;
    console.log(`🔌 Socket conectado: ${user.email} (${user.role})`);

    if (user.role === Role.ADMIN) {
      socket.join("admin");
    } else if (user.role === Role.DRIVER) {
      const driver = await prisma.driver.findFirst({ where: { userId: user.id } });
      if (driver) socket.join(`driver:${driver.id}`);
    }

    // Motorista transmite localização (broadcast para admin)
    socket.on("driver:location", async (data: { latitude: number; longitude: number; speed?: number; heading?: number; accuracy?: number; routeId?: string }) => {
      if (user.role !== Role.DRIVER) return;
      const driver = await prisma.driver.findFirst({ where: { userId: user.id } });
      if (!driver) return;
      // persistir
      await prisma.locationPing.create({
        data: {
          driverId: driver.id,
          routeId: data.routeId,
          latitude: data.latitude,
          longitude: data.longitude,
          speed: data.speed,
          heading: data.heading,
          accuracy: data.accuracy,
          recordedAt: new Date(),
        },
      }).catch(() => null);

      io.to("admin").emit("driver:location", {
        driverId: driver.id,
        latitude: data.latitude,
        longitude: data.longitude,
        speed: data.speed,
        heading: data.heading,
        recordedAt: new Date(),
      });
    });

    socket.on("disconnect", () => {
      console.log(`❌ Socket desconectado: ${user.email}`);
    });
  });
}
