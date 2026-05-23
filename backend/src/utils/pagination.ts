export type PaginationInput = {
  page?: number;
  limit?: number;
};

export type Pagination = {
  page: number;
  limit: number;
  skip: number;
};

export const getPagination = (input: PaginationInput): Pagination => {
  const page = Math.max(input.page ?? 1, 1);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};
