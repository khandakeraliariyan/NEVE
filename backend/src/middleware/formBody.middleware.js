import querystring from "node:querystring";

import { webRequestOf } from "../http/request.js";

// Like express.urlencoded({ extended: false }): parses
// application/x-www-form-urlencoded bodies up to the limit into req.body.
// Other content types leave req.body as it is.
export function urlencodedBody({ limitBytes = 100 * 1024 } = {}) {
    return async function parseUrlencoded(req, res, next) {
        const request = webRequestOf(req);
        const contentType = request?.headers.get("content-type") ?? "";
        if (!request || !/^application\/x-www-form-urlencoded(\s*;|$)/i.test(contentType)) return next();

        const tooLarge = () => {
            const error = new Error("request entity too large");
            error.status = 413;
            return error;
        };
        if (Number(request.headers.get("content-length")) > limitBytes) return next(tooLarge());
        const buffer = request.body ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0);
        if (buffer.length > limitBytes) return next(tooLarge());

        req.body = { ...querystring.parse(buffer.toString("utf8")) };
        return next();
    };
}
