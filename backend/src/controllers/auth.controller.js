export function getCurrentUser(req, res) {
    return res.status(200).json({
        success: true,
        message: "Authenticated successfully",
        user: req.user,
    });
}