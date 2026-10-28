export const getPagination = (query = {}) => {
    const parsedPage = Number.parseInt(query.page, 10);
    const parsedLimit = Number.parseInt(query.limit, 10);

    const page =
        Number.isInteger(parsedPage) && parsedPage > 0
            ? parsedPage
            : 1;

    const limit =
        Number.isInteger(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 50)
            : 10;

    return {
        page,
        limit,
        skip: (page - 1) * limit,
    };
};

export const buildPagination = ({
    page,
    limit,
    total,
}) => ({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1,
});
