const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const allowedOrigins = CLIENT_ORIGIN.split(',').map((origin) => origin.trim());

function setupSocket(server, userSocketMap) {
    const io = new Server(server, {
        cors: {
            origin: (origin, callback) => {
                if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
                    callback(null, true);
                } else {
                    callback(new Error(`CORS policy does not allow access from origin ${origin}`));
                }
            },
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    const emitOnlineUsers = async (roomId, excludeSocketId = null) => {
        try {
            const sockets = await io.in(roomId).fetchSockets();
            const remaining = excludeSocketId ? sockets.filter(s => s.id !== excludeSocketId) : sockets;
            const onlineUsers = Array.from(new Map(remaining.map(s => [s.user.id, { id: s.user.id, username: s.user.username }])).values());
            io.to(roomId).emit('onlineUsers', onlineUsers);
        } catch (err) {
            console.error('Error fetching sockets:', err);
        }
    };

    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        
        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) return next(new Error('Authentication error: Invalid token'));
            socket.user = decoded.user;
            next();
        });
    });

    io.on('connection', (socket) => {
        if (socket.user && socket.user.id) {
            userSocketMap.set(socket.user.id, socket.id);
        }

        socket.on('disconnecting', () => {
            for (const roomId of socket.rooms) {
                if (roomId !== socket.id) {
                    emitOnlineUsers(roomId, socket.id);
                }
            }
        });

        socket.on('disconnect', () => {
            if (socket.user && userSocketMap.get(socket.user.id) === socket.id) {
                userSocketMap.delete(socket.user.id);
            }
        });

        socket.on('joinRoom', async (payload) => {
            const roomId = typeof payload === 'object' ? payload.roomId : payload;
            const password = typeof payload === 'object' ? payload.password : null;

            try {
                const room = await prisma.room.findUnique({ 
                    where: { id: roomId },
                    include: { members: { select: { id: true } } }
                });
                if (!room) return socket.emit('error', { message: 'Room not found' });

                if (room.type === 'password') {
                    if (!password) return socket.emit('error', { message: 'Password required' });
                    
                    const isMatch = await bcrypt.compare(password, room.password);
                    if (!isMatch) return socket.emit('error', { message: 'Incorrect Password' });
                }

                if (room.type === 'request') {
                    const isMember = room.ownerId === socket.user.id || room.members.some(m => m.id === socket.user.id);
                    if (!isMember) return socket.emit('error', { message: 'Not authorized to join this room' });
                }

                socket.join(roomId);
                emitOnlineUsers(roomId);
            } catch (err) {
                console.error('Error joining room:', err);
            }
        });

        socket.on('leaveRoom', (roomId) => {
            socket.leave(roomId);
            emitOnlineUsers(roomId);
        });

        socket.on('sendMessage', async (data) => {
            const { roomId, content } = data;
            
            // Final Security Check: Ensure the user actually joined this room channel
            if (!socket.rooms.has(roomId)) {
                return socket.emit('error', { message: 'Unauthorized: You must join the room first' });
            }

            try {
                const savedMessage = await prisma.message.create({
                    data: { content, roomId, userId: socket.user.id },
                    include: { user: { select: { username: true } } }
                });
                io.to(roomId).emit('newMessage', savedMessage);
            } catch (error) {
                console.error('Error saving message:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });
    });

    return io;
}

module.exports = setupSocket;