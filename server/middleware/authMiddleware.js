const jwt = require('jsonwebtoken');

function getRefreshTokenFromReq(req) {
    return (
        (req.cookies && req.cookies.refreshToken) ||
        req.header('x-refresh-token') ||
        req.header('refresh-token') ||
        (req.body && req.body.token) ||
        null
    );
}

module.exports = function (req, res, next) {
    const authHeader = req.header('Authorization');

    if (!authHeader) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Malformed token, authorization denied' });
    }

    if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
        console.error('Missing JWT_SECRET or JWT_REFRESH_SECRET in environment');
        return res.status(500).json({ message: 'Authentication configuration is missing on the server.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        return next();
    } catch (err) {
        if (err && err.name === 'TokenExpiredError') {
            const refreshToken = getRefreshTokenFromReq(req);
            if (!refreshToken) {
                return res.status(401).json({ message: 'Access token expired; refresh token required' });
            }

            try {
                const decodedRefresh = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

                const payload = { user: { id: decodedRefresh.user.id } };
                const accessTokenTtl = process.env.ACCESS_TOKEN_LIFETIME || '15s';
                const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: accessTokenTtl });

                res.set('x-access-token', newAccessToken);

                req.user = decodedRefresh.user;
                return next();
            } catch (refreshErr) {
                return res.status(401).json({ message: 'Invalid refresh token' });
            }
        }

        return res.status(401).json({ message: 'Token is not valid' });
    }
};