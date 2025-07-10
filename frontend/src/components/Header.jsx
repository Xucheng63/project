// components/Header.jsx
import React from 'react';

const Header = ({ username, toggleSidebar, isSidebarOpen }) => {
  return (
    <header className="app-header">
      <button 
        className="sidebar-toggle"
        onClick={toggleSidebar}
        aria-label={isSidebarOpen ? "Close the sidebar" : "Open the sidebar"}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3 6H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      
      <div className="app-logo">
        <svg width="32" height="32" viewBox="0 0 41 41" fill="none" xmlns="http://www.w3.org/2000/svg" className="logo-icon">
          <path d="M37.532 16.87C37.021 15.153 36.306 13.523 35.416 12.004C33.171 8.36089 29.909 5.58116 26.09 4.22692C22.271 2.87267 18.13 3.02505 14.42 4.65C11.5923 5.9586 9.15671 8.0423 7.32639 10.6407C5.49607 13.239 4.34263 16.2599 4.00001 19.42C3.68314 22.5348 4.16719 25.6728 5.40539 28.5291C6.64359 31.3854 8.59314 33.8612 11.06 35.7C13.1242 37.2235 15.4383 38.3464 17.8889 39.0088C20.3395 39.6712 22.8836 39.861 25.4 39.57C28.2772 39.2394 31.0529 38.2229 33.476 36.5979C35.899 34.9729 37.9047 32.7851 39.33 30.21C40.918 27.3999 41.697 24.2104 41.586 21C41.454 19.6207 41.204 18.254 40.84 16.92" stroke="#10a37f" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M23.54 31.18C29.9396 31.18 35.13 25.9896 35.13 19.59C35.13 13.1904 29.9396 8 23.54 8C17.1404 8 11.95 13.1904 11.95 19.59C11.95 25.9896 17.1404 31.18 23.54 31.18Z" stroke="#10a37f" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="app-title">AI Assistant</span>
      </div>
      
      <div className="user-menu">
        <div className="user-avatar">
          {username ? username[0].toUpperCase() : '?'}
        </div>
      </div>
    </header>
  );
};

export default Header;