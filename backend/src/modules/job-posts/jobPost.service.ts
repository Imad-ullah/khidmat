import { ApplicationStatus, BookingStatus, NotificationEvent, Role, VerificationStatus } from '@prisma/client';
import { AppError } from '../../utils/appError';
import { getPagination } from '../../utils/pagination';
import { createNotificationPayload, dispatchNotification } from '../notifications/notification.service';
import type { ApplyJobPostInput, CreateJobPostInput, ListJobPostsQuery } from './jobPost.schema';
import { jobPostRepository, type JobPostWithRelations } from './jobPost.repository';

type PublicJobPost = {
  id: string;
  bookingId: string;
  title: string;
  description: string;
  categoryId: string;
  categoryName: string;
  budgetMin: number;
  budgetMax: number;
  photoUrls: string[];
  expiresAt: string;
  status: BookingStatus;
  applications: Array<{
    id: string;
    providerId: string;
    quote: number;
    message: string;
    status: ApplicationStatus;
  }>;
};

const toPublicJobPost = (jobPost: JobPostWithRelations): PublicJobPost => ({
  id: jobPost.id,
  bookingId: jobPost.bookingId,
  title: jobPost.title,
  description: jobPost.booking.description,
  categoryId: jobPost.booking.categoryId,
  categoryName: jobPost.booking.category.name,
  budgetMin: jobPost.budgetMin,
  budgetMax: jobPost.budgetMax,
  photoUrls: jobPost.photoUrls,
  expiresAt: jobPost.expiresAt.toISOString(),
  status: jobPost.booking.status,
  applications: jobPost.applications.map((application) => ({
    id: application.id,
    providerId: application.providerId,
    quote: application.quote,
    message: application.message,
    status: application.status,
  })),
});

export const jobPostService = {
  create: async (user: { id: string; role: Role }, input: CreateJobPostInput): Promise<PublicJobPost> => {
    if (user.role !== Role.CUSTOMER) {
      throw new AppError('Customer role is required', 403, 'CUSTOMER_ROLE_REQUIRED');
    }

    const customer = await jobPostRepository.findCustomerByUserId(user.id);
    if (customer === null) {
      throw new AppError('Customer profile not found', 404, 'CUSTOMER_NOT_FOUND');
    }

    const activeCount = await jobPostRepository.countActiveCustomerBookings(customer.id);
    if (activeCount >= 3) {
      throw new AppError('Customer cannot have more than 3 active bookings', 409, 'ACTIVE_BOOKING_LIMIT_REACHED');
    }

    return toPublicJobPost(await jobPostRepository.create(customer.id, input));
  },

  listOpen: async (user: { id: string; role: Role }, query: ListJobPostsQuery): Promise<{ jobPosts: PublicJobPost[]; page: number; limit: number }> => {
    if (user.role !== Role.PROVIDER) {
      throw new AppError('Provider role is required', 403, 'PROVIDER_ROLE_REQUIRED');
    }

    const provider = await jobPostRepository.findProviderByUserId(user.id);
    if (provider === null || provider.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new AppError('Verified provider profile is required', 403, 'PROVIDER_NOT_VERIFIED');
    }

    const pagination = getPagination(query);
    const jobPosts = await jobPostRepository.listOpen(query, pagination);

    return {
      jobPosts: jobPosts.map(toPublicJobPost),
      page: pagination.page,
      limit: pagination.limit,
    };
  },

  apply: async (user: { id: string; role: Role }, jobPostId: string, input: ApplyJobPostInput): Promise<{ id: string; quote: number; status: ApplicationStatus }> => {
    if (user.role !== Role.PROVIDER) {
      throw new AppError('Provider role is required', 403, 'PROVIDER_ROLE_REQUIRED');
    }

    const provider = await jobPostRepository.findProviderByUserId(user.id);
    if (provider === null || provider.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new AppError('Verified provider profile is required', 403, 'PROVIDER_NOT_VERIFIED');
    }

    const jobPost = await jobPostRepository.findById(jobPostId);
    if (jobPost === null || jobPost.booking.status !== BookingStatus.PENDING_CONFIRMATION || jobPost.expiresAt <= new Date()) {
      throw new AppError('Open job post not found', 404, 'JOB_POST_NOT_FOUND');
    }

    if (jobPost.booking.customer.userId === user.id) {
      throw new AppError('Provider cannot apply to their own job post', 409, 'PROVIDER_CANNOT_APPLY_SELF');
    }

    const application = await jobPostRepository.apply(jobPost.id, jobPost.bookingId, provider.id, input);
    await dispatchNotification(createNotificationPayload({
      userId: jobPost.booking.customer.userId,
      event: NotificationEvent.PROVIDER_APPLIED_TO_JOB,
      title: 'New provider application',
      body: 'A provider applied to your job post.',
      data: { jobPostId: jobPost.id, applicationId: application.id },
    }));

    return {
      id: application.id,
      quote: application.quote,
      status: application.status,
    };
  },

  selectApplication: async (user: { id: string; role: Role }, jobPostId: string, applicationId: string): Promise<PublicJobPost> => {
    if (user.role !== Role.CUSTOMER) {
      throw new AppError('Customer role is required', 403, 'CUSTOMER_ROLE_REQUIRED');
    }

    const customer = await jobPostRepository.findCustomerByUserId(user.id);
    const jobPost = await jobPostRepository.findById(jobPostId);
    if (customer === null || jobPost === null || jobPost.booking.customerId !== customer.id) {
      throw new AppError('Job post not found', 404, 'JOB_POST_NOT_FOUND');
    }

    if (jobPost.booking.status !== BookingStatus.PENDING_CONFIRMATION) {
      throw new AppError('Job post is not open for selection', 409, 'JOB_POST_NOT_OPEN');
    }

    const application = jobPost.applications.find((candidate) => candidate.id === applicationId);
    if (application === undefined || application.status !== ApplicationStatus.PENDING) {
      throw new AppError('Application not found', 404, 'APPLICATION_NOT_FOUND');
    }

    const selected = await jobPostRepository.selectApplication(jobPost.id, application.id, application.providerId, application.quote);
    const selectedApplication = selected.applications.find((candidate) => candidate.id === application.id);
    if (selectedApplication?.provider.userId !== undefined) {
      await dispatchNotification(createNotificationPayload({
        userId: selectedApplication.provider.userId,
        event: NotificationEvent.JOB_APPLICATION_ACCEPTED,
        title: 'Application accepted',
        body: 'A customer accepted your job application.',
        data: { jobPostId: jobPost.id, bookingId: selected.bookingId, applicationId: application.id },
      }));
    }

    return toPublicJobPost(selected);
  },
};
