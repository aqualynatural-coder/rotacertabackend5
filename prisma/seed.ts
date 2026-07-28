import { PrismaClient, Role, DeliveryStatus, RouteStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed iniciando...");

  await prisma.deliveryFailure.deleteMany();
  await prisma.proofOfDelivery.deleteMany();
  await prisma.locationPing.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.route.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  const adminHash = await bcrypt.hash("admin123", 12);
  const driverHash = await bcrypt.hash("motorista123", 12);

  const admin = await prisma.user.create({
    data: {
      name: "Administrador RotaCerta",
      email: "admin@rotacerta.app",
      passwordHash: adminHash,
      role: Role.ADMIN,
    },
  });

  const driverUser = await prisma.user.create({
    data: {
      name: "Carlos Motorista",
      email: "motorista@rotacerta.app",
      passwordHash: driverHash,
      role: Role.DRIVER,
      driver: {
        create: {
          phone: "+5511999998888",
          licenseNumber: "SP-12345678",
          vehiclePlate: "RCT-2A26",
          vehicleModel: "Fiat Fiorino 2024",
        },
      },
    },
    include: { driver: true },
  });

  const driver2 = await prisma.user.create({
    data: {
      name: "Ana Souza",
      email: "ana@rotacerta.app",
      passwordHash: driverHash,
      role: Role.DRIVER,
      driver: {
        create: {
          phone: "+5511988887777",
          licenseNumber: "SP-87654321",
          vehiclePlate: "RCT-9B99",
          vehicleModel: "VW Saveiro 2023",
        },
      },
    },
    include: { driver: true },
  });

  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        name: "Padaria Pão Quente",
        phone: "+551133334444",
        address: "Av. Paulista, 1500",
        city: "São Paulo",
        state: "SP",
        zipCode: "01310-100",
        latitude: -23.561414,
        longitude: -46.655881,
      },
    }),
    prisma.customer.create({
      data: {
        name: "Mercado Bom Preço",
        phone: "+551133335555",
        address: "R. Augusta, 2000",
        city: "São Paulo",
        state: "SP",
        zipCode: "01412-100",
        latitude: -23.556263,
        longitude: -46.662193,
      },
    }),
    prisma.customer.create({
      data: {
        name: "Farmácia Vida",
        phone: "+551133336666",
        address: "R. Oscar Freire, 800",
        city: "São Paulo",
        state: "SP",
        zipCode: "01426-000",
        latitude: -23.562634,
        longitude: -46.671283,
      },
    }),
    prisma.customer.create({
      data: {
        name: "Restaurante Sabor Caseiro",
        phone: "+551133337777",
        address: "R. Haddock Lobo, 500",
        city: "São Paulo",
        state: "SP",
        zipCode: "01414-001",
        latitude: -23.559120,
        longitude: -46.664050,
      },
    }),
    prisma.customer.create({
      data: {
        name: "Loja Elétrica Central",
        phone: "+551133338888",
        address: "Av. Rebouças, 1200",
        city: "São Paulo",
        state: "SP",
        zipCode: "05402-100",
        latitude: -23.565420,
        longitude: -46.678100,
      },
    }),
  ]);

  const today = new Date();
  today.setHours(8, 0, 0, 0);

  const route1 = await prisma.route.create({
    data: {
      name: "Rota Centro-SP - Manhã",
      status: RouteStatus.PLANNED,
      driverId: driverUser.driver!.id,
      scheduledFor: today,
    },
  });

  for (let i = 0; i < customers.length; i++) {
    const scheduled = new Date(today.getTime() + (i + 1) * 45 * 60 * 1000);
    await prisma.delivery.create({
      data: {
        routeId: route1.id,
        customerId: customers[i].id,
        driverId: driverUser.driver!.id,
        sequence: i + 1,
        status: DeliveryStatus.ASSIGNED,
        scheduledAt: scheduled,
        notes: `Entrega #${i + 1} da rota da manhã`,
      },
    });
  }

  const route2 = await prisma.route.create({
    data: {
      name: "Rota Zona Sul - Tarde",
      status: RouteStatus.PLANNED,
      driverId: driver2.driver!.id,
      scheduledFor: new Date(today.getTime() + 6 * 60 * 60 * 1000),
    },
  });

  await prisma.delivery.create({
    data: {
      routeId: route2.id,
      customerId: customers[0].id,
      driverId: driver2.driver!.id,
      sequence: 1,
      status: DeliveryStatus.ASSIGNED,
      scheduledAt: new Date(today.getTime() + 7 * 60 * 60 * 1000),
    },
  });

  console.log("✅ Seed concluído!");
  console.log("👤 Admin: admin@rotacerta.app / admin123");
  console.log("🚚 Motorista: motorista@rotacerta.app / motorista123");
  console.log("🚚 Motorista 2: ana@rotacerta.app / motorista123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
