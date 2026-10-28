
import mongoose from "mongoose";

const propertyViewEventSchema = new mongoose.Schema(
    {
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true
        },
        viewer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        viewedAt: {
            type: Date,
            default: Date.now,
            required: true
        }
    },
    { timestamps: true }
);

propertyViewEventSchema.index({
    property: 1,
    viewedAt: -1
});

propertyViewEventSchema.index({
    property: 1,
    viewer: 1,
    viewedAt: -1
});

const PropertyViewEvent = mongoose.model(
    "PropertyViewEvent",
    propertyViewEventSchema
);

export default PropertyViewEvent;
