const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { prisma } = require('./config/db');

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
        },
        perMessageDeflate: false // Optimization: Disables compression for faster CPU processing of small chat messages
    });

    const emitOnlineUsers = async (roomId, excludeSocketId = null) => {
        try {
            const sockets = await io.in(roomId).fetchSockets();
            const remaining = excludeSocketId ? sockets.filter(s => s.id !== excludeSocketId) : sockets;
            const onlineUsers = Array.from(new Map(remaining.map(s => {
                // fetchSockets() returns RemoteSocket objects, custom data must be accessed via s.data
                const user = s.data?.user || s.user; 
                if (!user) return null;
                return [user.id, { id: user.id, username: user.username }];
            }).filter(Boolean)).values());
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

        jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
            if (err) return next(new Error('Authentication error: Invalid token'));
            
            try {
                const user = await prisma.user.findUnique({
                    where: { id: decoded.user.id },
                    select: { id: true, username: true }
                });
                if (!user) return next(new Error('Authentication error: User not found'));
                socket.user = user;
                socket.data.user = user; // Required for fetchSockets() to access the user object
                next();
            } catch (dbErr) {
                console.error('Socket auth DB error:', dbErr);
                next(new Error('Authentication error: Server error'));
            }
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

            // Optimistically join the room channel to prevent dropped messages
            socket.join(roomId);

            try {
                const room = await prisma.room.findUnique({ 
                    where: { id: roomId },
                    select: { id: true, type: true, ownerId: true, members: { select: { id: true } } }
                });
                if (!room) {
                    socket.leave(roomId);
                    return socket.emit('error', { message: 'Room not found' });
                }

                if (room.type === 'request') {
                    const isMember = room.ownerId === socket.user.id || room.members.some(m => m.id === socket.user.id);
                    if (!isMember) {
                        socket.leave(roomId);
                        return socket.emit('error', { message: 'Not authorized to join this room' });
                    }
                }

                if (room.type !== 'open' && !room.members.some(m => m.id === socket.user.id)) {
                    await prisma.room.update({
                        where: { id: roomId },
                        data: { members: { connect: { id: socket.user.id } } }
                    });
                }

                emitOnlineUsers(roomId);
            } catch (err) {
                console.error('Error joining room:', err);
                socket.leave(roomId);
            }
        });

        socket.on('leaveRoom', (roomId) => {
            socket.leave(roomId);
            emitOnlineUsers(roomId);
        });

        socket.on('sendMessage', async (data, callback) => {
            const { roomId, content } = data;
            
            // Final Security Check: Ensure the user actually joined this room channel
            if (!socket.rooms.has(roomId)) {
                if (callback) callback({ error: 'Unauthorized' });
                return socket.emit('error', { message: 'Unauthorized: You must join the room first' });
            }

            try {
                const savedMessage = await prisma.message.create({
                    data: { content, roomId, userId: socket.user.id },
                    include: { user: { select: { username: true } } }
                });
                
                // Broadcast to everyone else, but NOT the sender (to avoid duplicates)
                socket.to(roomId).emit('newMessage', savedMessage);
                if (callback) callback(savedMessage);
            } catch (error) {
                console.error('Error saving message:', error);
                if (callback) callback({ error: 'Failed' });
                socket.emit('error', { message: 'Failed to send message' });
            }
        });
    });

    return io;
}

module.exports = setupSocket;