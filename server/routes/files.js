const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Define the upload directory path relative to the project root
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Configure Multer for file storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR); // Save files to the 'uploads' directory
    },
    filename: function (req, file, cb) {
        // Use a timestamp and the original extension to create a unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// @route   GET /files
// @desc    Get a list of all uploaded files
// @access  Public (can be protected by adding authMiddleware)
router.get('/files', (req, res) => {
    fs.readdir(UPLOAD_DIR, (err, files) => {
        if (err) {
            console.error("Could not list the directory.", err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        // Map files to include URLs for accessing them
        const fileInfos = files.map(file => {
            return {
                filename: file,
                url: `${req.protocol}://${req.get('host')}/uploads/${file}`,
                downloadUrl: `${req.protocol}://${req.get('host')}/download/${file}`
            };
        });

        res.json(fileInfos);
    });
});

router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file was uploaded.' });
    }
    res.status(201).json({
        message: 'File uploaded successfully!',
        file: {
            ...req.file,
            url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`,
            downloadUrl: `${req.protocol}://${req.get('host')}/download/${req.file.filename}`
        }
    });
});

router.get('/download/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(UPLOAD_DIR, filename);

    const resolvedPath = path.resolve(filePath);
    const resolvedUploadDir = path.resolve(UPLOAD_DIR);
    if (!resolvedPath.startsWith(resolvedUploadDir)) {
        return res.status(403).json({ message: 'Forbidden: Access is denied.' });
    }

    if (fs.existsSync(filePath)) {
        res.download(filePath, (err) => {
            if (err) {
                console.error("Error downloading file:", err);
                if (!res.headersSent) {
                    res.status(500).send('Could not download the file.');
                }
            }
        });
    } else {
        res.status(404).json({ message: 'File not found.' });
    }
});

module.exports = router;