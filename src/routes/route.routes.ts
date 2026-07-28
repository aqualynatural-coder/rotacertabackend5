import { Router } from "express";
import { z } from "zod";
import { Role, RouteStatus, DeliveryStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authRequired, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { audit } from "../utils/audit";

const router = Router();
router.use(authRequired);

router.get("/", async (req, res, next) => {
  try {
    const where: any = {};
    if (req.user!.role === Role.DRIVER) {
      const d = await prisma.driver.findFirst({ where: { userId: req.user!.id } });
      if (!d) return res.json([]);
      where.driverId = d.id;
    }
    const list = await prisma.route.findMany({
      where,
      include: {
        driver: { include: { user: { select: { id: true, name: true } } } },
        deliveries: { include: { customer: true }, orderBy: { sequence: "asc" } },
      },
      orderBy: { scheduledFor: "desc" },
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const r = await prisma.route.findUnique({
      where: { id: req.params.id },
      include: {
        driver: { include: { user: true } },
        deliveries: { include: { customer: true, proof: true, failure: true }, orderBy: { sequence: "asc" } },
        pings: { orderBy: { recordedAt: "asc" }, take: 500 },
      },
    });
    if (!r) throw new HttpError(404, "Rota não encontrada");
    res.json(r);
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({
  name: z.string().min(2),
  driverId: z.string().optional(),
  scheduledFor: z.string().datetime(),
  deliveries: z
    .array(
      z.object({
        customerId: z.string(),
        scheduledAt: z.string().datetime().optional(),
        notes: z.string().optional(),
      })
    )
    .optional(),
});

router.post("/", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const r = await prisma.route.create({
      data: {
        name: data.name,
        driverId: data.driverId,
        scheduledFor: new Date(data.scheduledFor),
        deliveries: data.deliveries
          ? {
              create: data.deliveries.map((d, i) => ({
                customerId: d.customerId,
                driverId: data.driverId,
                sequence: i + 1,
                status: data.driverId ? DeliveryStatus.ASSIGNED : DeliveryStatus.PENDING,
                scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
                notes: d.notes,
              })),
            }
          : undefined,
      },
      include: { deliveries: { include: { customer: true } } },
    });

    await audit({ userId: req.user!.id, action: "ROUTE_CREATED", entity: "Route", entityId: r.id });

    // Notifica motorista
    const io = req.app.get("io");
    if (data.driverId) io?.to(`driver:${data.driverId}`).emit("delivery:assigned", { routeId: r.id });

    res.status(201).json(r);
  } catch (e) {
    next(e);
  }
});

router.post("/:id/start", async (req, res, next) => {
  try {
    const r = await prisma.route.update({
      where: { id: req.params.id },
      data: { status: RouteStatus.ACTIVE, startedAt: new Date() },
    });
    const io = req.app.get("io");
    io?.emit("route:started", { routeId: r.id, driverId: r.driverId });
    await audit({ userId: req.user!.id, action: "ROUTE_STARTED", entity: "Route", entityId: r.id });
    res.json(r);
  } catch (e) {
    next(e);
  }
});

router.post("/:id/end", async (req, res, next) => {
  try {
    const r = await prisma.route.update({
      where: { id: req.params.id },
      data: { status: RouteStatus.COMPLETED, endedAt: new Date() },
    });
    const io = req.app.get("io");
    io?.emit("route:ended", { routeId: r.id, driverId: r.driverId });
    res.json(r);
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    await prisma.route.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
