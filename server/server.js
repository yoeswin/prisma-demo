require('dotenv').config(); // Load environment variables
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:5180';
const allowedOrigins = CLIENT_ORIGIN.split(',').map((origin) => origin.trim());

// Connect to Database
connectDB();

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
}));
app.use(express.json()); // To parse JSON bodies
app.use(cookieParser());

// --- Static Assets & Uploads Directory ---
const UPLOAD_DIR = path.join(__dirname, 'uploads');
// Ensure upload directory exists on server start
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}
// Serve files from the uploads directory
app.use('/uploads', express.static(UPLOAD_DIR));

// --- 2. API Routes ---
// Root/Health-check route
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the File Upload API!' });
});

// Mount routers
app.use('/api/auth', require('./routes/auth'));
app.use('/', require('./routes/files')); // Contains /files, /upload, /download

// --- 3. Start Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Uploads will be stored in: ${UPLOAD_DIR}`);
});