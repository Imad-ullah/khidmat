import { ApplicationStatus, BookingStatus, BookingType, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import type { ApplyJobPostInput, CreateJobPostInput, ListJobPostsQuery } from './jobPost.schema';

const jobPostInclude = {
  booking: {
    include: {
      customer: {
        include: {
          user: {
            select: { id: true, phone: true, role: true, status: true },
          },
        },
      },
      provider: true,
      category: true,
    },
  },
  applications: {
    include: {
      provider: true,
    },
  },
} satisfies Prisma.JobPostInclude;

export type JobPostWithRelations = Prisma.JobPostGetPayload<{ include: typeof jobPostInclude }>;

export const jobPostRepository = {
  findCustomerByUserId: async (userId: string) => {
    return prisma.customer.findUnique({ where: { userId } });
  },

  findProviderByUserId: async (userId: string) => {
    return prisma.provider.findUnique({ where: { userId } });
  },

  countActiveCustomerBookings: async (customerId: string): Promise<number> => {
    return prisma.booking.count({
      where: {
        customerId,
        status: { in: [BookingStatus.PENDING_CONFIRMATION, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED] },
        deletedAt: null,
      },
    });
  },

  create: async (customerId: string, input: CreateJobPostInput): Promise<JobPostWithRelations> => {
    const expiresAt = new Date();
    expiresAt.setUTCHours(expiresAt.getUTCHours() + 72);

    return prisma.jobPost.create({
      data: {
        title: input.title,
        budgetMin: input.budgetMin,
        budgetMax: input.budgetMax,
        photoUrls: input.photoUrls,
        expiresAt,
        booking: {
          create: {
            customerId,
            categoryId: input.categoryId,
            bookingType: BookingType.JOB_POST,
            status: BookingStatus.PENDING_CONFIRMATION,
            description: input.description,
            paymentStatus: PaymentStatus.UNPAID,
            proofPhotoUrls: [],
          },
        },
      },
      include: jobPostInclude,
    });
  },

  findById: async (id: string): Promise<JobPostWithRelations | null> => {
    return prisma.jobPost.findUnique({
      where: { id },
      include: jobPostInclude,
    });
  },

  listOpen: async (query: ListJobPostsQuery, pagination: { skip: number; limit: number }): Promise<JobPostWithRelations[]> => {
    return prisma.jobPost.findMany({
      where: {
        expiresAt: { gt: new Date() },
        booking: {
          deletedAt: null,
          status: BookingStatus.PENDING_CONFIRMATION,
          category: query.category === undefined ? undefined : { OR: [{ id: query.category }, { slug: query.category }] },
          customer: query.city === undefined ? undefined : { city: query.city },
        },
      },
      include: jobPostInclude,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { expiresAt: 'asc' },
    });
  },

  apply: async (jobPostId: string, bookingId: string, providerId: string, input: ApplyJobPostInput) => {
    return prisma.jobApplication.create({
      data: {
        jobPostId,
        bookingId,
        providerId,
        quote: input.quote,
        message: input.message,
      },
    });
  },

  selectApplication: async (jobPostId: string, applicationId: string, providerId: string, quote: number): Promise<JobPostWithRelations> => {
    return prisma.$transaction(async (transaction) => {
      const jobPost = await transaction.jobPost.update({
        where: { id: jobPostId },
        data: {
          booking: {
            update: {
              providerId,
              totalAmount: quote,
              status: BookingStatus.IN_PROGRESS,
            },
          },
        },
      });

      await transaction.jobApplication.update({
        where: { id: applicationId },
        data: { status: ApplicationStatus.ACCEPTED },
      });

      await transaction.jobApplication.updateMany({
        where: { jobPostId, id: { not: applicationId } },
        data: { status: ApplicationStatus.REJECTED },
      });

      return transaction.jobPost.findUniqueOrThrow({
        where: { id: jobPost.id },
        include: jobPostInclude,
      });
    });
  },
};
