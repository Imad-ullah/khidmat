import { prisma } from '../../prisma/client';
import { getPagination } from '../../utils/pagination';
import type {
  AdminBookingListQuery,
  AdminListQuery,
  AdminUserListQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
  UpdateUserStatusInput,
} from './admin.schema';

const monthStart = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

export const adminService = {
  dashboard: async () => {
    const [users, providersPending, openDisputes, activeBookings, completedThisMonth, latestBookings] = await Promise.all([
      prisma.user.count(),
      prisma.provider.count({ where: { verificationStatus: 'PENDING_ADMIN_REVIEW', deletedAt: null } }),
      prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
      prisma.booking.count({ where: { status: { in: ['PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS'] }, deletedAt: null } }),
      prisma.booking.count({ where: { status: { in: ['COMPLETED', 'CLOSED'] }, completedAt: { gte: monthStart() }, deletedAt: null } }),
      prisma.booking.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { include: { user: { select: { phone: true } } } },
          provider: { include: { user: { select: { phone: true } } } },
          category: true,
        },
      }),
    ]);

    const bookingStatusCounts = await prisma.booking.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    return {
      kpis: {
        users,
        providersPending,
        openDisputes,
        activeBookings,
        completedThisMonth,
      },
      bookingStatusCounts: bookingStatusCounts.map((item) => ({
        status: item.status,
        count: item._count.status,
      })),
      latestBookings: latestBookings.map((booking) => ({
        id: booking.id,
        status: booking.status,
        categoryName: booking.category.name,
        customerPhone: booking.customer.user.phone,
        providerPhone: booking.provider?.user.phone ?? null,
        createdAt: booking.createdAt.toISOString(),
      })),
    };
  },

  listBookings: async (query: AdminBookingListQuery) => {
    const pagination = getPagination(query);
    const bookings = await prisma.booking.findMany({
      where: {
        status: query.status,
        deletedAt: null,
      },
      include: {
        customer: { include: { user: { select: { phone: true } } } },
        provider: { include: { user: { select: { phone: true } } } },
        category: true,
      },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
    });

    return {
      bookings: bookings.map((booking) => ({
        id: booking.id,
        bookingType: booking.bookingType,
        status: booking.status,
        categoryName: booking.category.name,
        customerPhone: booking.customer.user.phone,
        providerPhone: booking.provider?.user.phone ?? null,
        totalAmount: booking.totalAmount,
        createdAt: booking.createdAt.toISOString(),
      })),
      page: pagination.page,
      limit: pagination.limit,
    };
  },

  listUsers: async (query: AdminUserListQuery) => {
    const pagination = getPagination(query);
    const users = await prisma.user.findMany({
      where: {
        role: query.role,
        status: query.status,
      },
      include: {
        customer: true,
        provider: true,
      },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
    });

    return {
      users: users.map((user) => ({
        id: user.id,
        phone: user.phone,
        email: user.email,
        role: user.role,
        status: user.status,
        name: user.customer?.fullName ?? user.provider?.displayName ?? null,
        city: user.customer?.city ?? user.provider?.city ?? null,
        createdAt: user.createdAt.toISOString(),
      })),
      page: pagination.page,
      limit: pagination.limit,
    };
  },

  updateUserStatus: async (userId: string, input: UpdateUserStatusInput) => {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { status: input.status },
    });

    return {
      id: user.id,
      status: user.status,
    };
  },

  listCategories: async (query: AdminListQuery) => {
    const pagination = getPagination(query);
    const categories = await prisma.serviceCategory.findMany({
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            bookings: true,
            services: true,
          },
        },
      },
    });

    return {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        iconUrl: category.iconUrl,
        isActive: category.isActive,
        bookingsCount: category._count.bookings,
        servicesCount: category._count.services,
      })),
      page: pagination.page,
      limit: pagination.limit,
    };
  },

  createCategory: async (input: CreateCategoryInput) => {
    return prisma.serviceCategory.create({ data: input });
  },

  updateCategory: async (categoryId: string, input: UpdateCategoryInput) => {
    return prisma.serviceCategory.update({
      where: { id: categoryId },
      data: input,
    });
  },

  listAuditLogs: async (query: AdminListQuery) => {
    const pagination = getPagination(query);
    const auditLogs = await prisma.auditLog.findMany({
      include: {
        admin: {
          select: {
            id: true,
            phone: true,
            email: true,
          },
        },
      },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
    });

    return {
      auditLogs: auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        targetId: log.targetId,
        metadata: log.metadata,
        admin: log.admin,
        createdAt: log.createdAt.toISOString(),
      })),
      page: pagination.page,
      limit: pagination.limit,
    };
  },
};
