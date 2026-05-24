import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
let socket = null;

export const getSocket = (accessToken) => {
    if (!socket && accessToken) {
        socket = io(API_BASE, {
            auth: { token: accessToken },
            transports: ['websocket'], // Bypasses HTTP polling
        });
    }
    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};