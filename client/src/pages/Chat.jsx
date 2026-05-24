import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatRoomsList from '../components/ChatRoomsList';
import { useAuth } from '../AuthContext';
import { getSocket } from '../socketManager';

export default function Chat() {
    const navigate = useNavigate();
    const { accessToken } = useAuth();
    const socket = getSocket(accessToken);

    return (
        <div className="chat-page" style={{ padding: '20px' }}>
            <ChatRoomsList socket={socket} onSelectRoom={(roomId, isOwner) => navigate(`/chat/${roomId}`, { state: { isOwner } })} />
        </div>
    );
}