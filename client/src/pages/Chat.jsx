import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatRoomsList from '../components/ChatRoomsList';
import { useAuth } from '../AuthContext';
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function Chat() {
    const navigate = useNavigate();
    const { accessToken } = useAuth();
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        if (!accessToken) return;

        const newSocket = io(API_BASE, {
            auth: { token: accessToken }
        });
        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [accessToken]);

    return (
        <div className="chat-page" style={{ padding: '20px' }}>
            <ChatRoomsList socket={socket} onSelectRoom={(roomId, isOwner) => navigate(`/chat/${roomId}`, { state: { isOwner } })} />
        </div>
    );
}