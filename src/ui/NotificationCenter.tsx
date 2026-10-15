import React, { useState, useEffect, useCallback } from 'react';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  description?: string;
  duration?: number;
}

/**
 * Global handler for UI notifications and error reporting.
 */
class NotificationService {
  private listeners: ((notifications: Notification[]) => void)[] = [];
  private notifications: Notification[] = [];

  public subscribe(listener: (notifications: Notification[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l([...this.notifications]));
  }

  public show(message: string, type: NotificationType = 'info', description?: string, duration: number = 5000) {
    const id = Math.random().toString(36).substring(2, 9);
    const newNotification: Notification = { id, type, message, description, duration };
    
    this.notifications = [newNotification, ...this.notifications].slice(0, 5);
    this.notify();

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  public success(message: string, description?: string) {
    return this.show(message, 'success', description);
  }

  public error(message: string, description?: string) {
    return this.show(message, 'error', description, 10000); // Errors stay longer
  }

  public warning(message: string, description?: string) {
    return this.show(message, 'warning', description, 7000);
  }

  public dismiss(id: string) {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.notify();
  }
}

export const notificationService = new NotificationService();

/**
 * React component to render the notifications.
 */
export const NotificationCenter: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    return notificationService.subscribe(setNotifications);
  }, []);

  if (notifications.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '24px',
      right: '24px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      maxWidth: '380px'
    }}>
      {notifications.map(n => (
        <div 
          key={n.id}
          style={{
            background: '#fff',
            borderLeft: `4px solid ${getTypeColor(n.type)}`,
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            padding: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            animation: 'slideIn 0.3s ease-out'
          }}
        >
          <div style={{ flex: 1, marginRight: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px', color: '#111827' }}>
              {n.message}
            </div>
            {n.description && (
              <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.4' }}>
                {n.description}
              </div>
            )}
          </div>
          <button 
            onClick={() => notificationService.dismiss(n.id)}
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer', 
              color: '#9ca3af',
              fontSize: '18px',
              lineHeight: '1',
              padding: '0 4px'
            }}
          >
            ×
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

function getTypeColor(type: NotificationType): string {
  switch (type) {
    case 'success': return '#10b981';
    case 'error': return '#ef4444';
    case 'warning': return '#f59e0b';
    case 'info':
    default: return '#3b82f6';
  }
}
