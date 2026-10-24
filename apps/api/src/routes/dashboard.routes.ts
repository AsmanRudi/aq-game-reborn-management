import { Router } from 'express';
import { BookingStatus, PaymentStatus, SessionStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { getAllStationsWithState } from '../services/station.service.js';

export const dashboardRouter = Router();

// GET /api/v1/dashboard/summary
dashboardRouter.get('/summary', async (_request, response, next) => {
  try {
    const stations = await getAllStationsWithState();
    const totalStations = stations.length;
    const availableStations = stations.filter((s) => s.canStartRental).length;
    const activeSessionsCount = stations.filter((s) => s.status === 'Aktif').length;
    // Get today's Asia/Jakarta calendar boundary
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayBookingsCount = await prisma.booking.count({
      where: {
        startsAt: { gte: startOfToday },
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
      },
    });

    const todayPayments = await prisma.payment.aggregate({
      where: {
        recordedAt: { gte: startOfToday },
        status: PaymentStatus.CONFIRMED,
      },
      _sum: {
        amount: true,
      },
    });

    const activeSessions = await prisma.rentalSession.findMany({
      where: { status: SessionStatus.ACTIVE },
      include: {
        station: true,
        customer: true,
      },
      orderBy: { startedAt: 'desc' },
    });

    const formattedActiveRows = activeSessions.map((session) => {
      const diffMs = Math.max(0, Date.now() - new Date(session.startedAt).getTime());
      const totalSeconds = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const elapsed = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

      const startFormatted = new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jakarta',
      }).format(new Date(session.startedAt));

      return {
        id: session.id,
        stationCode: session.station.code,
        customerName: session.customer?.name || 'Pelanggan Walk-in',
        startedAtTime: startFormatted,
        elapsed,
      };
    });

    response.json({
      data: {
        metrics: {
          totalStations,
          availableStations,
          activeSessionsCount,
          todayBookingsCount,
          todayRevenue: todayPayments._sum.amount ?? 0,
        },
        stations,
        activeRows: formattedActiveRows,
      },
    });
  } catch (error) {
    next(error);
  }
});
