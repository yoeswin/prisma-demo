require('dotenv').config(); // Load environment variables
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { connectDB, prisma } = require('./config/db');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const allowedOrigins = CLIENT_ORIGIN.split(',').map((origin) => origin.trim());

connectDB();

const userSocketMap = new Map(); // <userId, socketId>
const io = setupSocket(server, userSocketMap);

// --- Global Middleware ---
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS policy does not allow access from origin ${origin}`));
        }
    },
    credentials: true,
    exposedHeaders: ['x-access-token']
}));
app.use((req, res, next) => {
    req.io = io;
    req.userSocketMap = userSocketMap;
    next();
});
app.use(express.json());
app.use(cookieParser());

// --- Static Assets & Uploads Directory ---
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}
app.use('/uploads', express.static(UPLOAD_DIR));


app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the File Upload API!' });
});

app.post('/api/test/prisma', async (req, res) => {
    try {
        const username = "nsbehjbwd";

        if (!username) {
            return res.status(400).json({ status: 'error', message: 'Please provide a username in the request body' });
        }

        const newUser = await prisma.user.create({
            data: { username: 'testuser123', password: 'testpassword123' }
        });

        return res.json({ status: 'ok', user: newUser });
    } catch (error) {
        console.error('Prisma test failed:', error);
        return res.status(500).json({ status: 'error', message: 'Prisma MongoDB test failed', error: error.message });
    }
});

// Mount routers
app.use('/api/auth', require('./routes/auth'));
app.use('/api/todos', require('./routes/todos'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/', require('./routes/files'));

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Uploads will be stored in: ${UPLOAD_DIR}`);
});

process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down...');
    await prisma.$disconnect();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});