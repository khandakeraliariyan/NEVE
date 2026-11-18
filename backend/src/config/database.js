import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase() {
    await mongoose.connect(env.MONGODB_URI, {
        // On Windows "localhost" can resolve to IPv6 (::1) first, while
        // mongod listens on IPv4 by default. Prefer IPv4 to skip that detour.
        family: 4,
    });

    console.log("MongoDB connected successfully");

    // The driver reconnects on its own; these just make a dropped connection
    // and its recovery visible in the log.
    mongoose.connection.on("disconnected", () => {
        console.warn("MongoDB connection lost. Reconnecting…");
    });
    mongoose.connection.on("reconnected", () => {
        console.log("MongoDB reconnected.");
    });
}
