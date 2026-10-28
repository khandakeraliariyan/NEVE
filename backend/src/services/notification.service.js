const Notification = require("../models/Notification");

const createNotification = async ({
    recipient,
    type,
    title,
    message,
    relatedProperty = null,
    relatedViewingRequest = null,
}) => {
    if (!recipient) {
        throw new Error("Notification recipient is required.");
    }

    return Notification.create({
        recipient,
        type,
        title,
        message,
        relatedProperty,
        relatedViewingRequest,
    });
};

module.exports = {
    createNotification,
};