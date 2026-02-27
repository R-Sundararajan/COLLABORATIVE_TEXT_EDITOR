const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

router.post("/create", authMiddleware, (req, res) => {
    res.json({
        message: "Project created successfully",
        userId: req.userId
    });
});

module.exports = router;