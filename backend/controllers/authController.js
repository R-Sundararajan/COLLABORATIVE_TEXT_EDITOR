// controllers/authController.js

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Generate JWT
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
};

// Register User
exports.register = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser)
            return res.status(400).json({ message: "User already exists" });

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        const user = await User.create({
            email,
            passwordHash
        });

        res.status(201).json({
            token: generateToken(user._id),
            userId: user._id
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Login User
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user)
            return res.status(400).json({ message: "Invalid Username/Password" });

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch)
            return res.status(400).json({ message: "Invalid Username/Password" });

        res.json({
            token: generateToken(user._id),
            userId: user._id
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};