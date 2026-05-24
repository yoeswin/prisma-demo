const express = require('express');
const multer = require('multer');
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const router = express.Router();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);
const BUCKET_NAME = process.env.SUPABASE_BUCKET_NAME || 'uploads';

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.get('/files', authMiddleware, async (req, res) => {
    try {
        // Only list files located inside the user's specific folder
        const { data: files, error } = await supabase.storage.from(BUCKET_NAME).list(req.user.id);

        if (error) throw error;

        const validFiles = files.filter(file => file.name !== '.emptyFolderPlaceholder');

        const fileInfos = validFiles.map(file => {
            const filePath = `${req.user.id}/${file.name}`;
            const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
            
            return {
                filename: file.name,
                url: publicUrlData.publicUrl,
                downloadUrl: `${req.protocol}://${req.get('host')}/download/${file.name}`
            };
        });

        res.json(fileInfos);
    } catch (err) {
        console.error("Could not list files from Supabase.", err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file was uploaded.' });
    }

    const fileId = crypto.randomUUID();
    const filename = `${fileId}${path.extname(req.file.originalname)}`;
    const filePath = `${req.user.id}/${filename}`; // Prepend user ID to create a user-specific folder

    try {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            });

        if (error) throw error;

        const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

        res.status(201).json({
            message: 'File uploaded successfully!',
            file: {
                originalname: req.file.originalname,
                filename: filename,
                mimetype: req.file.mimetype,
                size: req.file.size,
                url: publicUrlData.publicUrl,
                downloadUrl: `${req.protocol}://${req.get('host')}/download/${filename}`
            }
        });
    } catch (err) {
        console.error("Supabase upload error:", err);
        res.status(500).json({ message: 'Failed to upload file.' });
    }
});

router.get('/download/:filename', authMiddleware, async (req, res) => {
    const { filename } = req.params;
    const filePath = `${req.user.id}/${filename}`; // Scope download to the user's folder

    try {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download(filePath);
            
        if (error) throw error;

        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', data.type || 'application/octet-stream');
        res.send(buffer);
    } catch (err) {
        console.error("Error downloading file from Supabase:", err);
        res.status(404).json({ message: 'File not found.' });
    }
});

module.exports = router;