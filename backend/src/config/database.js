import mongoose from "mongoose";
import { env } from "./env.js";

// The pending or open connection, shared by every route bundle in the process.
const state = (globalThis.__neveDatabase ??= { connecting: null });

// Connects once and reuses the connection. Safe to call on every request,
// which every API route does (see http/route.js): warm instances reuse the
// open connection, and a failed attempt is retried on the next call.
export function connectDatabase() {
    state.connecting ??= mongoose
        .connect(env.MONGODB_URI, {
            // On Windows "localhost" can resolve to IPv6 (::1) first, while
            // mongod listens on IPv4 by default. Prefer IPv4 to skip that detour.
            family: 4,
            // Fail fast instead of holding a serverless request for 30 seconds.
            serverSelectionTimeoutMS: 10000,
        })
        .then(() => {
            console.log("MongoDB connected successfully");

            // The driver reconnects on its own; these just make a dropped
            // connection and its recovery visible in the log.
            mongoose.connection.on("disconnected", () => {
                console.warn("MongoDB connection lost. Reconnecting...");
            });
            mongoose.connection.on("reconnected", () => {
                console.log("MongoDB reconnected.");
            });
        })
        .catch((error) => {
            state.connecting = null;
            throw error;
        });
    return state.connecting;
}
