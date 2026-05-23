import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../AuthContext';
import Modal from './Modal';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const ChatRoom = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const isOwner = location.state?.isOwner || false;
    const { authFetch, accessToken } = useAuth();
    const [socket, setSocket] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [pendingUsers, setPendingUsers] = useState([]);
    const [members, setMembers] = useState([]);
    const [roomOwnerId, setRoomOwnerId] = useState(null);
    const [showMembers, setShowMembers] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [roomType, setRoomType] = useState('open');
    const messagesEndRef = useRef(null);
    const [modalConfig, setModalConfig] = useState({ isOpen: false });

    const currentUserId = useMemo(() => {
        if (!accessToken) return null;
        try {
            const payload = JSON.parse(atob(accessToken.split('.')[1]));
            return payload?.user?.id || null;
        } catch (e) {
            return null;
        }
    }, [accessToken]);

    const closeModal = () => setModalConfig({ isOpen: false });

    const showAlert = (message, title = 'Alert', onConfirmAction = null) => {
        setModalConfig({
            isOpen: true, type: 'alert', title, message,
            onConfirm: () => { closeModal(); if (onConfirmAction) onConfirmAction(); },
            onClose: () => { closeModal(); if (onConfirmAction) onConfirmAction(); }
        });
    };

    useEffect(() => {
        if (isOwner) {
            authFetch(`${API_BASE}/api/rooms/${roomId}/pending`)
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                if (Array.isArray(data)) setPendingUsers(data);
            })
            .catch(err => console.error("Failed to load pending users", err));
        }

        authFetch(`${API_BASE}/api/rooms/${roomId}/members`)
        .then(async res => {
            if (!res.ok) throw new Error('Failed to load members');
            return res.json();
        })
        .then(data => {
            if (data.members) setMembers(data.members);
            if (data.ownerId) setRoomOwnerId(data.ownerId);
            if (data.type) setRoomType(data.type);
        })
        .catch(err => console.error("Failed to load members:", err));

        authFetch(`${API_BASE}/api/rooms/${roomId}/messages`)
        .then(async res => {
            if (!res.ok) {
                if (res.status === 401) throw new Error('Unauthorized');
                if (res.status === 403) throw new Error('Forbidden');
                throw new Error('Failed to load messages');
            }
            return res.json();
        })
        .then(data => setMessages(data))
        .catch(err => {
            console.error("Failed to load messages:", err);
            if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
                if (err.message === 'Forbidden') {
                    showAlert('You are not authorized to view this room. Please request access from the lobby.', 'Access Denied', () => navigate('/chat'));
                } else {
                    navigate('/chat');
                }
            }
        });

        const newSocket = io(API_BASE, {
            auth: { token: accessToken },
            forceNew: true,
            transports: ['websocket']
        });

        setSocket(newSocket);
        newSocket.emit('joinRoom', { roomId });

        newSocket.on('newMessage', (message) => {
            setMessages((prev) => [...prev, message]);
        });
        
        newSocket.on('newPendingRequest', (data) => {
            if (isOwner && data.roomId === roomId) {
                setPendingUsers(prev => {
                    // Avoid adding duplicates if the list is already up-to-date
                    if (prev.some(u => u.id === data.user.id)) return prev;
                    return [...prev, data.user];
                });
            }
        });

        newSocket.on('onlineUsers', (users) => {
            setOnlineUsers(users);
            // Ensure anyone who joins dynamically is immediately added to the members UI
            setMembers(prev => {
                const updated = [...prev];
                let changed = false;
                users.forEach(u => {
                    if (!updated.some(m => m.id === u.id)) {
                        updated.push(u);
                        changed = true;
                    }
                });
                return changed ? updated : prev;
            });
        });

        newSocket.on('roomDeleted', () => {
            showAlert('This room has been deleted by the admin.', 'Room Deleted', () => navigate('/chat'));
        });

        newSocket.on('error', (err) => {
            showAlert(err.message || 'An error occurred', 'Error', () => {
                if (err.message.includes('Unauthorized') || err.message.includes('Not authorized')) {
                    navigate('/chat');
                }
            });
        });

        return () => {
            newSocket.emit('leaveRoom', roomId);
            newSocket.disconnect();
        };
    }, [roomId, accessToken, isOwner]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = (e) => {
        e.preventDefault();
        if (input.trim() && socket) {
            socket.emit('sendMessage', { roomId, content: input });
            setInput('');
        }
    };

    const handleApprove = async (userId) => {
        try {
            const res = await authFetch(`${API_BASE}/api/rooms/${roomId}/approve`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            if (!res.ok) throw new Error('Failed to approve user');
            
            const approvedUser = pendingUsers.find(u => u.id === userId);
            if (approvedUser) {
                setMembers(prev => {
                    if (prev.some(m => m.id === approvedUser.id)) return prev;
                    return [...prev, approvedUser];
                });
            }
            setPendingUsers(prev => prev.filter(u => u.id !== userId));
        } catch(e) { console.error(e); showAlert('Error approving user', 'Error'); }
    };

    const handleReject = async (userId) => {
        try {
            const res = await authFetch(`${API_BASE}/api/rooms/${roomId}/reject`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            if (!res.ok) throw new Error('Failed to reject user');
            setPendingUsers(prev => prev.filter(u => u.id !== userId));
        } catch(e) { console.error(e); showAlert('Error rejecting user', 'Error'); }
    };

    return (
        <div className="chat-room-container" style={{ width: '100%', maxWidth: '1000px', margin: '20px auto', display: 'flex', flexDirection: 'column', height: '80vh', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '15px 20px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8f9fa' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button 
                        onClick={() => navigate('/chat')} 
                        style={{ 
                            marginRight: '15px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            background: '#e9ecef', 
                            border: '1px solid #ced4da', 
                            padding: '6px 12px', 
                            borderRadius: '6px', 
                            cursor: 'pointer', 
                            fontSize: '14px', 
                            color: '#495057',
                            fontWeight: '600',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#dee2e6'; e.currentTarget.style.color = '#212529'; }}
                        onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#e9ecef'; e.currentTarget.style.color = '#495057'; }}
                    >
                        <span>&larr;</span> Rooms
                    </button>
                    <h3 style={{ margin: 0, color: '#333' }}>Chat Room</h3>
                </div>
                <button 
                    onClick={() => setShowMembers(!showMembers)}
                    style={{ background: 'none', border: '1px solid #007bff', color: '#007bff', borderRadius: '20px', padding: '6px 12px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                >
                    {showMembers ? 'Hide Members' : (roomType === 'open' ? `Online (${onlineUsers.length})` : `Members (${members.length})`)}
                </button>
            </div>
            
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Main Chat Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {isOwner && pendingUsers.length > 0 && (
                        <div style={{ padding: '10px 20px', backgroundColor: '#fff3cd', borderBottom: '1px solid #ffeeba' }}>
                            <strong style={{ display: 'block', marginBottom: '10px', color: '#856404' }}>Pending Requests ({pendingUsers.length})</strong>
                            {pendingUsers.map(u => (
                                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                    <span style={{ color: '#856404', fontWeight: '500' }}>{u.username} wants to join</span>
                                    <div>
                                        <button onClick={() => handleApprove(u.id)} style={{ marginRight: '5px', padding: '4px 8px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Approve</button>
                                        <button onClick={() => handleReject(u.id)} style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Reject</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="messages-list" style={{ flex: 1, overflowY: 'auto', padding: '20px', backgroundColor: '#f0f2f5', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {messages.map((msg) => {
                            const isMine = msg.userId === currentUserId;
                            return (
                                <div key={msg.id} style={{ 
                                    alignSelf: isMine ? 'flex-end' : 'flex-start', 
                                    maxWidth: '70%', 
                                    backgroundColor: isMine ? '#007bff' : '#fff', 
                                    padding: '10px 15px', 
                                    borderRadius: '15px', 
                                    borderBottomRightRadius: isMine ? 0 : '15px',
                                    borderBottomLeftRadius: isMine ? '15px' : 0, 
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)' 
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '15px', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '0.85em', color: isMine ? '#cce5ff' : '#666', fontWeight: 'bold' }}>
                                            {isMine ? 'You' : (msg.user?.username || 'Unknown')}
                                        </span>
                                        <span style={{ fontSize: '0.7em', color: isMine ? '#cce5ff' : '#999', opacity: 0.8 }}>
                                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div style={{ color: isMine ? '#fff' : '#333' }}>{msg.content}</div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                    <form onSubmit={sendMessage} style={{ display: 'flex', gap: '10px', padding: '15px', backgroundColor: '#fff', borderTop: '1px solid #e0e0e0' }}>
                        <input 
                            style={{ flex: 1, padding: '10px 15px', border: '1px solid #ccc', borderRadius: '20px', outline: 'none' }}
                            value={input} 
                            onChange={(e) => setInput(e.target.value)} 
                            placeholder="Type a message..."
                        />
                        <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold' }}>Send</button>
                    </form>
                </div>

                {/* Members Sidebar */}
                {showMembers && (
                    <div style={{ width: '250px', borderLeft: '1px solid #e0e0e0', backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                        <div style={{ padding: '15px', borderBottom: '1px solid #e0e0e0', fontWeight: 'bold', color: '#333', backgroundColor: '#fff' }}>
                            {roomType === 'open' ? `Online (${onlineUsers.length})` : `Members (${members.length})`}
                        </div>
                        <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {(roomType === 'open' ? onlineUsers : members).map(m => {
                                const isOnline = onlineUsers.some(u => u.id === m.id);
                                return (
                                    <div key={m.id} style={{ padding: '10px', borderRadius: '8px', backgroundColor: '#fff', border: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: isOnline ? '#28a745' : '#ccc', transition: 'background-color 0.3s' }}></div>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ color: '#333', fontSize: '14px', fontWeight: m.id === currentUserId ? 'bold' : '500' }}>
                                                {m.username} {m.id === currentUserId && <span style={{ fontWeight: 'normal', color: '#666' }}>(You)</span>}
                                            </span>
                                            {m.id === roomOwnerId && <span style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Admin</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <Modal {...modalConfig} />
        </div>
    );
};

export default ChatRoom;