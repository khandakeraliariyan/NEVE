import mongoose from "mongoose";
import { defineModel } from "./defineModel.js";

const nearbyPlaceCacheSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      unique: true,
      index: true,
    },

    places: [
      {
        osmId: { type: String, required: true },
        name: { type: String, default: "Unnamed place" },
        subcategory: { type: String, default: null },
        category: {
          type: String,
          enum: [
            "healthcare",
            "education",
            "groceries",
            "transport",
            "banking",
            "recreation",
            "food",
            "other",
          ],
          required: true,
        },
        osmType: {
          type: String,
          enum: ["node", "way", "relation"],
          default: null,
        },
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        distanceMeters: { type: Number, required: true },
        distanceKm: { type: Number, required: true },
      },
    ],

    radiusMeters: {
      type: Number,
      min: 100,
      max: 5000,
      default: 5000,
      required: true,
    },

    centerLatitude: {
      type: Number,
      min: -90,
      max: 90,
      default: null,
    },

    centerLongitude: {
      type: Number,
      min: -180,
      max: 180,
      default: null,
    },

    fetchedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true }
);

export default defineModel(
  "NearbyPlaceCache",
  nearbyPlaceCacheSchema
);
