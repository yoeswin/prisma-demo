const rateLimitStore = new Map();

module.exports = function (options = {}) {
    const windowMs = options.windowMs || 15 * 60 * 1000;
    const max = options.max || 5;

    return (req, res, next) => {
        const now = Date.now();

        const username = (req.body && req.body.username) || (req.user && req.user.username);

        const key = username ? `user:${username}` : `ip:${req.ip || req.connection?.remoteAddress || 'unknown'}`;

        let entry = rateLimitStore.get(key);
        if (!entry || now - entry.start > windowMs) {
            entry = { count: 1, start: now };
        } else {
            entry.count += 1;
        }

        rateLimitStore.set(key, entry);

        if (entry.count > max) {
            const retryAfter = Math.ceil((windowMs - (now - entry.start)) / 1000);
            res.set('Retry-After', String(retryAfter));
            return res.status(429).json({ message: 'Too many requests. Try again later.' });
        }

        next();
    };
};
