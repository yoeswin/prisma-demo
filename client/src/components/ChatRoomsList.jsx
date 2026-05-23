import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const ChatRoomsList = ({ onSelectRoom, socket }) => {
    const { authFetch, accessToken, user } = useAuth();
    const [rooms, setRooms] = useState([]);
    const [newRoomName, setNewRoomName] = useState('');
    const [roomType, setRoomType] = useState('open');
    const [roomPassword, setRoomPassword] = useState('');
    const [error, setError] = useState(null);

    const currentUserId = useMemo(() => {
        if (!accessToken) return null;
        try { return JSON.parse(atob(accessToken.split('.')[1]))?.user?.id || null; } 
        catch (e) { return null; }
    }, [accessToken]);

    useEffect(() => {
        fetchRooms();

        if (!socket) return;

        const handleApproval = ({ roomId, roomName, members }) => {
            alert(`Your request to join "${roomName}" has been approved!`);
            // Update the room in the local state to grant access
            setRooms(prevRooms =>
                prevRooms.map(room =>
                    room.id === roomId ? { ...room, members } : room
                )
            );
        };

        const handleRejection = ({ roomName }) => {
            alert(`Your request to join "${roomName}" has been rejected.`);
        };

        socket.on('joinRequestApproved', handleApproval);
        socket.on('joinRequestRejected', handleRejection);

        return () => {
            socket.off('joinRequestApproved', handleApproval);
            socket.off('joinRequestRejected', handleRejection);
        };
    }, [socket]);

    const fetchRooms = async () => {
        try {
            const response = await authFetch(`${API_BASE}/api/rooms`);
            if (response.ok) {
                const data = await response.json();
                setRooms(data);
            } else {
                console.error('Failed to fetch rooms');
            }
        } catch (err) {
            console.error('Error fetching rooms:', err);
        }
    };

    const handleCreateRoom = async (e) => {
        e.preventDefault();
        if (!newRoomName.trim()) return;

        setError(null);
        try {
            const response = await authFetch(`${API_BASE}/api/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: newRoomName.trim(),
                    type: roomType,
                    password: roomType === 'password' ? roomPassword : null
                }),
            });

            if (response.ok) {
                const newRoom = await response.json();
                setRooms([newRoom, ...rooms]); // Add the newly created room to the top
                setNewRoomName('');
                setRoomPassword('');
            } else {
                const errorData = await response.json();
                setError(errorData.message || 'Failed to create room');
            }
        } catch (err) {
            console.error('Error creating room:', err);
            setError('An unexpected error occurred');
        }
    };

    const handleRoomClick = async (room) => {
        const isOwner = room.ownerId === currentUserId;

        if (room.type === 'password') {
            const pwd = prompt('This room is password protected. Enter password:');
            if (pwd === null) return; // User cancelled
            
            try {
                const response = await authFetch(`${API_BASE}/api/rooms/${room.id}/verify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd })
                });
                if (!response.ok) {
                    alert('Incorrect password!');
                    return;
                }
            } catch (err) {
                alert('Error verifying password');
                return;
            }
        } else if (room.type === 'request') {
            const isMember = isOwner || room.members?.some(m => m.id === currentUserId);
            if (!isMember) {
                const sendReq = window.confirm('You are not a member of this room. Send a request to join?');
                if (sendReq) {
                    try {
                        const res = await authFetch(`${API_BASE}/api/rooms/${room.id}/request`, { method: 'POST' });
                        if (res.ok) alert('Request sent! Waiting for admin approval.');
                        else alert('Failed to send request. You may have already requested.');
                    } catch (err) { console.error('Error sending request', err); }
                }
                return;
            }
        }
        
        // Access granted, navigate to room
        onSelectRoom(room.id, room.type === 'password' ? pwd : null, isOwner);
    };

    return (
        <div className="chat-rooms-container" style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', borderRadius: '8px', backgroundColor: '#1e1e1e', color: '#f8f9fa', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
            <h2 style={{ borderBottom: '2px solid #333', paddingBottom: '10px', marginBottom: '20px', color: '#f8f9fa' }}>Available Chat Rooms</h2>

            <form onSubmit={handleCreateRoom} style={{ marginBottom: '30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="text"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder="Enter new room name..."
                        style={{ flex: 1, padding: '10px 15px', backgroundColor: '#2d2d2d', color: '#fff', border: '1px solid #444', borderRadius: '4px', fontSize: '16px' }}
                    />
                    <select 
                        value={roomType} 
                        onChange={(e) => setRoomType(e.target.value)}
                        style={{ padding: '10px', backgroundColor: '#2d2d2d', color: '#fff', border: '1px solid #444', borderRadius: '4px', outline: 'none' }}
                    >
                        <option value="open">Open Room</option>
                        <option value="password">Password Protected</option>
                        <option value="request">Request to Join</option>
                    </select>
                    <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>Create</button>
                </div>
                {roomType === 'password' && (
                    <input type="password" placeholder="Set a password for this room..." value={roomPassword} onChange={e => setRoomPassword(e.target.value)} style={{ padding: '10px 15px', backgroundColor: '#2d2d2d', color: '#fff', border: '1px solid #444', borderRadius: '4px', fontSize: '16px' }} required />
                )}
            </form>
            {error && <p style={{ color: '#dc3545', marginTop: '-20px', marginBottom: '20px' }}>{error}</p>}

            <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {rooms.map((room) => (
                    <li
                        key={room.id}
                        style={{
                            padding: '15px 20px',
                            border: '1px solid #444',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            backgroundColor: '#2d2d2d',
                            transition: 'background-color 0.2s'
                        }}
                        onClick={() => handleRoomClick(room)}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2d2d2d'}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <strong style={{ fontSize: '1.1em', color: '#4dabf7' }}># {room.name}</strong>
                            {room.type === 'password' && <span title="Password Protected" style={{ fontSize: '1.2em' }}>🔒</span>}
                            {room.type === 'request' && <span title="Request to Join" style={{ fontSize: '1.2em' }}>🛡️</span>}
                        </div>
                        <span style={{ fontSize: '0.85em', color: '#adb5bd' }}>
                            Created: {new Date(room.createdAt).toLocaleDateString()}
                        </span>
                    </li>
                ))}
                {rooms.length === 0 && <p style={{ textAlign: 'center', color: '#adb5bd', padding: '20px 0' }}>No rooms available. Create one to get started!</p>}
            </ul>
        </div>
    );
};

export default ChatRoomsList;