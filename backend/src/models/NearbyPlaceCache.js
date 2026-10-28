import mongoose from "mongoose";

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
        category: {
          type: String,
          enum: [
            "school",
            "hospital",
            "transport",
            "supermarket",
            "park",
            "other",
          ],
          required: true,
        },
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        distanceMeters: { type: Number, required: true },
      },
    ],

    fetchedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model(
  "NearbyPlaceCache",
  nearbyPlaceCacheSchema
);
