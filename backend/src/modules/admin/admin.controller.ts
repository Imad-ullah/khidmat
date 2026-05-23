import type { Request, Response } from 'express';
import { successResponse } from '../../utils/response';
import type {
  AdminBookingListQuery,
  AdminListQuery,
  AdminUserListQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
  UpdateUserStatusInput,
} from './admin.schema';
import { adminService } from './admin.service';

export const adminController = {
  dashboard: async (_request: Request, response: Response): Promise<void> => {
    successResponse(response, 200, 'Dashboard retrieved', await adminService.dashboard());
  },

  listBookings: async (request: Request, response: Response): Promise<void> => {
    successResponse(response, 200, 'Bookings retrieved', await adminService.listBookings(request.query as unknown as AdminBookingListQuery));
  },

  listUsers: async (request: Request, response: Response): Promise<void> => {
    successResponse(response, 200, 'Users retrieved', await adminService.listUsers(request.query as unknown as AdminUserListQuery));
  },

  updateUserStatus: async (request: Request, response: Response): Promise<void> => {
    successResponse(response, 200, 'User status updated', await adminService.updateUserStatus(request.params.id, request.body as UpdateUserStatusInput));
  },

  listCategories: async (request: Request, response: Response): Promise<void> => {
    successResponse(response, 200, 'Categories retrieved', await adminService.listCategories(request.query as unknown as AdminListQuery));
  },

  createCategory: async (request: Request, response: Response): Promise<void> => {
    successResponse(response, 201, 'Category created', await adminService.createCategory(request.body as CreateCategoryInput));
  },

  updateCategory: async (request: Request, response: Response): Promise<void> => {
    successResponse(response, 200, 'Category updated', await adminService.updateCategory(request.params.id, request.body as UpdateCategoryInput));
  },

  listAuditLogs: async (request: Request, response: Response): Promise<void> => {
    successResponse(response, 200, 'Audit logs retrieved', await adminService.listAuditLogs(request.query as unknown as AdminListQuery));
  },
};
