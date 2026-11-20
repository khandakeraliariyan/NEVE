// A small replacement for express.Router(): routes are declared with
// router.get/post/put/patch/delete(path, ...handlers), and router.use(...)
// adds middleware to every route declared after it, as in Express.

const METHODS = ["get", "post", "put", "patch", "delete"];

export function Router() {
    const shared = [];
    const routes = [];
    const router = {
        routes,
        use(...handlers) {
            shared.push(...handlers);
            return router;
        },
    };
    for (const method of METHODS) {
        router[method] = (path, ...handlers) => {
            routes.push({ method: method.toUpperCase(), path, handlers: [...shared, ...handlers] });
            return router;
        };
    }
    return router;
}

// Flattens mounted routers into one ordered list of endpoints with full path
// patterns, e.g. { method: "GET", pattern: "/api/v1/properties/:id", handlers }.
export function buildEndpoints(mounts) {
    const endpoints = [];
    for (const { prefix, router, middleware = [], method, path, handlers } of mounts) {
        if (router) {
            for (const item of router.routes) {
                const pattern = `${prefix}${item.path === "/" ? "" : item.path}` || "/";
                endpoints.push({ method: item.method, pattern, handlers: [...middleware, ...item.handlers] });
            }
        } else {
            endpoints.push({ method, pattern: path, handlers });
        }
    }
    return endpoints;
}
