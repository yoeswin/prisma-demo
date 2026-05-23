import React from 'react';

const Modal = ({ isOpen, type, title, message, onConfirm, onClose }) => {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(2px)'
        }}>
            <div style={{
                backgroundColor: '#fff', padding: '24px', borderRadius: '8px',
                width: '90%', maxWidth: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                color: '#333'
            }}>
                <h3 style={{ marginTop: 0, marginBottom: '15px', color: type === 'confirm' ? '#d9534f' : '#007bff' }}>
                    {title || (type === 'confirm' ? 'Confirm' : 'Alert')}
                </h3>
                <p style={{ marginBottom: '25px', fontSize: '15px', lineHeight: '1.5' }}>
                    {message}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    {type === 'confirm' && (
                        <button onClick={onClose} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', backgroundColor: '#e2e6ea', color: '#333', cursor: 'pointer', fontWeight: '500' }}>
                            Cancel
                        </button>
                    )}
                    <button onClick={onConfirm || onClose} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', backgroundColor: type === 'confirm' ? '#dc3545' : '#007bff', color: '#fff', cursor: 'pointer', fontWeight: '500' }}>
                        {type === 'confirm' ? 'Confirm' : 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Modal;