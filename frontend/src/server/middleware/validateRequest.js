import { ZodError } from "zod";

export const validateRequest = (schema) => {
    return (req, res, next) => {
        try {
            const validated = schema.parse({
                body: req.body,
                params: req.params,
                query: req.query,
            });

            req.validated = validated;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid request data.",
                    errors: error.issues.map((issue) => ({
                        path: issue.path.join("."),
                        message: issue.message,
                    })),
                });
            }

            next(error);
        }
    };
};
