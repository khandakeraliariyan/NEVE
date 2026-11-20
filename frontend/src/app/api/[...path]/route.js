// Any API path no route file handles gets a JSON 404.
import { notFound } from "../../../server/http/route.js";

export const dynamic = "force-dynamic";

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
