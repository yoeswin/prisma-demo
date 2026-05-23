const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/authMiddleware');
const bcrypt = require('bcryptjs');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// Get all chat rooms
router.get('/', async (req, res) => {
    try {
        const rooms = await prisma.room.findMany({
            select: { 
                id: true, 
                name: true, 
                type: true, 
                createdAt: true, 
                ownerId: true, 
                members: { select: { id: true } } 
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(rooms);
    } catch (error) {
        console.error('Fetch rooms error:', error);
        res.status(500).json({ message: 'Failed to fetch rooms' });
    }
});

// Create a new chat room
router.post('/', async (req, res) => {
    const { name, type, password } = req.body;
    
    if (!name) return res.status(400).json({ message: 'Room name is required' });

    try {
        let hashedPassword = null;
        if (type === 'password') {
            if (!password) return res.status(400).json({ message: 'Password is required' });
            hashedPassword = await bcrypt.hash(password, 10);
        }

        const newRoom = await prisma.room.create({
            data: { 
                name, 
                type: type || 'open', 
                password: hashedPassword,
                ownerId: req.user.id,
                members: { connect: { id: req.user.id } }
            },
        });
        
        // Remove password from the returned object
        const { password: _, ...roomSafe } = newRoom;
        res.status(201).json(roomSafe);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ message: 'Room already exists' });
        }
        console.error('Create room error:', error);
        res.status(500).json({ message: 'Failed to create room' });
    }
});

// Get messages for a specific room
router.get('/:roomId/messages', async (req, res) => {
    const { roomId } = req.params;
    const password = req.headers['x-room-password'];

    try {
        const room = await prisma.room.findUnique({ 
            where: { id: roomId },
            include: { members: { select: { id: true } } }
        });
        if (!room) return res.status(404).json({ message: 'Room not found' });

        if (room.type === 'password') {
            if (!password) return res.status(401).json({ message: 'Password required to view messages' });
            
            const isMatch = await bcrypt.compare(password, room.password);
            if (!isMatch) return res.status(401).json({ message: 'Incorrect password' });
        }

        if (room.type === 'request') {
            const isMember = room.ownerId === req.user.id || room.members.some(m => m.id === req.user.id);
            if (!isMember) return res.status(403).json({ message: 'Not authorized to view messages' });
        }

        const messages = await prisma.message.findMany({
            where: { roomId },
            include: { user: { select: { username: true } } },
            orderBy: { createdAt: 'asc' }
        });
        res.json(messages);
    } catch (error) {
        console.error('Fetch messages error:', error);
        res.status(500).json({ message: 'Failed to fetch messages' });
    }
});

// Get room members
router.get('/:roomId/members', async (req, res) => {
    const { roomId } = req.params;
    const password = req.headers['x-room-password'];

    try {
        const room = await prisma.room.findUnique({ 
            where: { id: roomId },
            include: { members: { select: { id: true, username: true } } }
        });
        
        if (!room) return res.status(404).json({ message: 'Room not found' });

        if (room.type === 'password') {
            if (!password) return res.status(401).json({ message: 'Password required to view members' });
            
            const isMatch = await bcrypt.compare(password, room.password);
            if (!isMatch) return res.status(401).json({ message: 'Incorrect password' });
        }

        if (room.type === 'request') {
            const isMember = room.ownerId === req.user.id || room.members.some(m => m.id === req.user.id);
            if (!isMember) return res.status(403).json({ message: 'Not authorized to view members' });
        }

        res.json({ ownerId: room.ownerId, members: room.members });
    } catch (error) {
        console.error('Fetch members error:', error);
        res.status(500).json({ message: 'Failed to fetch members' });
    }
});

// Verify Room Password
router.post('/:roomId/verify', async (req, res) => {
    const { roomId } = req.params;
    const { password } = req.body;

    try {
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room) return res.status(404).json({ message: 'Room not found' });
        if (room.type !== 'password') return res.json({ success: true });

        const isMatch = await bcrypt.compare(password, room.password);
        if (isMatch) res.json({ success: true });
        else res.status(401).json({ message: 'Incorrect password' });
    } catch (error) {
        console.error('Verify password error:', error);
        res.status(500).json({ message: 'Failed to verify password' });
    }
});

// Request to join a room
router.post('/:roomId/request', async (req, res) => {
    try {
        const room = await prisma.room.update({
            where: { id: req.params.roomId },
            data: { pending: { connect: { id: req.user.id } } }
        });

        if (room.ownerId) {
            const ownerSocketId = req.userSocketMap.get(room.ownerId);
            if (ownerSocketId) {
                const requestingUser = await prisma.user.findUnique({
                    where: { id: req.user.id },
                    select: { id: true, username: true }
                });

                req.io.to(ownerSocketId).emit('newPendingRequest', {
                    roomId: room.id,
                    user: requestingUser
                });
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Request join error:', error);
        res.status(500).json({ message: 'Failed to request join' });
    }
});

// Get pending requests (Owner only)
router.get('/:roomId/pending', async (req, res) => {
    try {
        const room = await prisma.room.findUnique({
            where: { id: req.params.roomId },
            include: { pending: { select: { id: true, username: true } } }
        });
        if (!room || room.ownerId !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
        res.json(room.pending);
    } catch (error) {
        console.error('Fetch pending error:', error);
        res.status(500).json({ message: 'Failed to fetch pending requests' });
    }
});

// Approve a user
router.post('/:roomId/approve', async (req, res) => {
    try {
        if (!req.body.userId) return res.status(400).json({ message: 'User ID is required' });

        const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });
        if (!room || room.ownerId !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
        const updatedRoom = await prisma.room.update({
            where: { id: req.params.roomId },
            data: {
                pending: { disconnect: { id: req.body.userId } },
                members: { connect: { id: req.body.userId } }
            },
            include: { members: { select: { id: true } } }
        });

        // Notify the approved user
        const approvedUserSocketId = req.userSocketMap.get(req.body.userId);
        if (approvedUserSocketId) {
            req.io.to(approvedUserSocketId).emit('joinRequestApproved', {
                roomId: updatedRoom.id,
                roomName: updatedRoom.name,
                members: updatedRoom.members
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ message: 'Failed to approve user' });
    }
});

// Reject a user
router.post('/:roomId/reject', async (req, res) => {
    try {
        if (!req.body.userId) return res.status(400).json({ message: 'User ID is required' });

        const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });
        if (!room || room.ownerId !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
        await prisma.room.update({
            where: { id: req.params.roomId },
            data: { pending: { disconnect: { id: req.body.userId } } }
        });

        // Notify the rejected user
        const rejectedUserSocketId = req.userSocketMap.get(req.body.userId);
        if (rejectedUserSocketId) {
            req.io.to(rejectedUserSocketId).emit('joinRequestRejected', {
                roomId: room.id,
                roomName: room.name
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Reject error:', error);
        res.status(500).json({ message: 'Failed to reject user' });
    }
});

module.exports = router;