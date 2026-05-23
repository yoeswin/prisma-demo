const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR); 
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

router.get('/files', (req, res) => {
    fs.readdir(UPLOAD_DIR, (err, files) => {
        if (err) {
            console.error("Could not list the directory.", err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

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