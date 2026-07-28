import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authRequired, requireRole } from "../middleware/auth";

const router = Router();
router.use(authRequired);

const pingSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  accuracy: z.number().optional(),
  recordedAt: z.string().datetime().optional(),
  routeId: z.string().optional(),
});

// Motorista envia ping (unitário)
router.post("/ping", async (req, res, next) => {
  try {
    const data = pingSchema.parse(req.body);
    const driver = await prisma.driver.findFirst({ where: { userId: req.user!.id } });
    if (!driver) return res.status(400).json({ error: "Somente motoristas podem enviar ping" });

    const ping = await prisma.locationPing.create({
      data: {
        driverId: driver.id,
        routeId: data.routeId,
        latitude: data.latitude,
        longitude: data.longitude,
        speed: data.speed,
        heading: data.heading,
        accuracy: data.accuracy,
        recordedAt: data.recordedAt ? new Date(data.recordedAt) : new Date(),
      },
    });

    const io = req.app.get("io");
    io?.to("admin").emit("driver:location", {
      driverId: driver.id,
      latitude: ping.latitude,
      longitude: ping.longitude,
      speed: ping.speed,
      heading: ping.heading,
      recordedAt: ping.recordedAt,
    });

    res.status(201).json(ping);
  } catch (e) {
    next(e);
  }
});

// Envio em lote (sincronização offline)
router.post("/ping/batch", async (req, res, next) => {
  try {
    const schema = z.object({ pings: z.array(pingSchema) });
    const { pings } = schema.parse(req.body);
    const driver = await prisma.driver.findFirst({ where: { userId: req.user!.id } });
    if (!driver) return res.status(400).json({ error: "Somente motoristas podem enviar ping" });

    const created = await prisma.locationPing.createMany({
      data: pings.map((p) => ({
        driverId: driver.id,
        routeId: p.routeId,
        latitude: p.latitude,
        longitude: p.longitude,
        speed: p.speed,
        heading: p.heading,
        accuracy: p.accuracy,
        recordedAt: p.recordedAt ? new Date(p.recordedAt) : new Date(),
      })),
    });

    res.json({ inserted: created.count });
  } catch (e) {
    next(e);
  }
});

// Última localização de cada motorista ativo
router.get("/live", requireRole(Role.ADMIN), async (_req, res, next) => {
  try {
    const drivers = await prisma.driver.findMany({
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        pings: { orderBy: { recordedAt: "desc" }, take: 1 },
      },
    });
    const result = drivers
      .filter((d) => d.pings.length > 0)
      .map((d) => ({
        driverId: d.id,
        name: d.user.name,
        avatarUrl: d.user.avatarUrl,
        vehiclePlate: d.vehiclePlate,
        latitude: d.pings[0].latitude,
        longitude: d.pings[0].longitude,
        speed: d.pings[0].speed,
        heading: d.pings[0].heading,
        recordedAt: d.pings[0].recordedAt,
      }));
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// Trajeto por rota
router.get("/route/:routeId", async (req, res, next) => {
  try {
    const pings = await prisma.locationPing.findMany({
      where: { routeId: req.params.routeId },
      orderBy: { recordedAt: "asc" },
    });
    res.json(pings);
  } catch (e) {
    next(e);
  }
});

export default router;
