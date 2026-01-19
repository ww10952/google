// Common utility functions for Tab Manager Pro

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} - Escaped HTML text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Get hex color code for group color
 * @param {string} color - Color name
 * @returns {string} - Hex color code
 */
function getGroupColorHex(color) {
  const colorMap = {
    grey: '#5f6368',
    blue: '#1a73e8',
    red: '#ea4335',
    yellow: '#fbbc04',
    green: '#34a853',
    pink: '#e91e63',
    purple: '#9c27b0',
    cyan: '#00bcd4'
  };
  return colorMap[color] || '#5f6368';
}

/**
 * Generate unique ID using crypto API
 * @returns {string} - Unique UUID
 */
function generateId() {
  // Use crypto.randomUUID() for better ID generation
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return Date.now().toString() + '-' + Math.random().toString(36).substring(2, 11);
}

/**
 * Show user-visible error message
 * @param {string} message - Error message to display
 * @param {Error} error - Error object (optional)
 */
function showError(message, error) {
  console.error(message, error);
  
  // Create a non-blocking notification
  const errorMessage = error ? `${message}: ${error.message}` : message;
  
  // Try to use a notification element if available, otherwise use alert
  const notification = document.createElement('div');
  notification.className = 'error-notification';
  notification.textContent = errorMessage;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #dc3545;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    max-width: 400px;
    word-wrap: break-word;
    animation: slideInRight 0.3s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}
