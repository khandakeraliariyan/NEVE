export const sendSuccess = (
    res,
    {
        message = "Request successful.",
        data = null,
        pagination = undefined,
        statusCode = 200,
    } = {}
) => {
    const response = {
        success: true,
        message,
        data,
    };

    if (pagination !== undefined) {
        response.pagination = pagination;
    }

    return res.status(statusCode).json(response);
};

export const sendError = (
    res,
    {
        message = "Request failed.",
        statusCode = 400,
        errors = undefined,
    } = {}
) => {
    const response = {
        success: false,
        message,
    };

    if (errors !== undefined) {
        response.errors = errors;
    }

    return res.status(statusCode).json(response);
};
