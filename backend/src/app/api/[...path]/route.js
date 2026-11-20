// The whole API: every /api/... request is matched against the endpoints in
// src/routes and run by src/http/route.js.
import { apiHandler } from "../../../http/route.js";
import { endpoints } from "../../../routes/index.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const handler = apiHandler(endpoints);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
