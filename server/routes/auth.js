const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/db');

const router = express.Router();
const usernameRateLimiter = require('../middleware/usernameRateLimiter')({ windowMs: 15 * 60 * 1000, max: 5 });

router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Please enter all fields' });
    }

    try {
        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
            },
        });

        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

router.post('/login', usernameRateLimiter, async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const payload = { user: { id: user.id } };

        if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
            console.error('Missing JWT_SECRET or JWT_REFRESH_SECRET in environment')
            return res.status(500).json({ message: 'Authentication configuration is missing on the server.' })
        }

        const accessTokenExpiresIn = process.env.ACCESS_TOKEN_LIFETIME || '15s';
        const refreshTokenExpiresIn = process.env.REFRESH_TOKEN_LIFETIME || '7d';

        const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: accessTokenExpiresIn });
        const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: refreshTokenExpiresIn });

        const refreshTokenMaxAge = process.env.REFRESH_TOKEN_MAX_AGE ? parseInt(process.env.REFRESH_TOKEN_MAX_AGE, 10) : 7 * 24 * 60 * 60 * 1000;
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'None',
            path: '/',
            maxAge: refreshTokenMaxAge
        });

        res.json({ accessToken, refreshToken });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   POST /api/auth/token
// @desc    Get a new access token from a refresh token
router.post('/token', (req, res) => {
    const token = (req.body && req.body.token) || (req.cookies && req.cookies.refreshToken);

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
        console.error('Missing JWT_SECRET or JWT_REFRESH_SECRET in environment')
        return res.status(500).json({ message: 'Authentication configuration is missing on the server.' })
    }

    jwt.verify(token, process.env.JWT_REFRESH_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid refresh token' });
        }

        const payload = { user: { id: decoded.user.id } };
        const accessTokenExpiresIn = process.env.ACCESS_TOKEN_LIFETIME || '15m';
        const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: accessTokenExpiresIn });

        res.json({ accessToken });
    });
});

// @route   POST /api/auth/logout
// @desc    Clear refresh token cookie
router.post('/logout', (req, res) => {
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'None',
        path: '/',
    });
    res.json({ message: 'Logged out' });
});

module.exports = router;