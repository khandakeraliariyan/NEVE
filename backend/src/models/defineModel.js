import mongoose from "mongoose";

// Registers a model once. Next.js can load a model file more than once in the
// same process (separate route bundles, hot reload in development), and
// Mongoose refuses to register the same name twice.
export function defineModel(name, schema, ...rest) {
    return mongoose.models[name] ?? mongoose.model(name, schema, ...rest);
}
