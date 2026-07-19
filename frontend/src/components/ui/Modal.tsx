import React, { useEffect, useState } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = '480px',
}) => {
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAnimating(true);
      document.body.style.overflow = 'hidden';
    } else {
      // Let exit animation play before unmounting
      const timer = setTimeout(() => setAnimating(false), 200);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen && !animating) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      style={{
        animation: isOpen ? 'fadeIn 0.2s ease' : 'fadeOut 0.15s ease',
      }}
    >
      <div
        className="glass-panel modal-content"
        style={{
          maxWidth,
          animation: isOpen ? 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)' : 'slideDown 0.15s ease',
          padding: '2rem',
        }}
      >
        <div className="modal-header">
          <h2 className="modal-title" style={{ fontSize: '1.15rem', margin: 0 }}>{title}</h2>
          <button className="btn-close" onClick={onClose} aria-label="Fermer">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ flexGrow: 1 }}>
          {children}
        </div>

        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
