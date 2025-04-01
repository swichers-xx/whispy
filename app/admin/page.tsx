'use client';

import React, { useState, useEffect } from 'react';
import PartySocket from 'partysocket';

// TODO: Move password and host to env variables
const ADMIN_PASSWORD = 'yodieadmin'; // Replace with a secure method later
const partykitHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST || 'localhost:1999';

// Define setting types (expand this later)
interface AdminSettings {
  welcomeMessage?: string;
  allowMediaUploads?: boolean;
  allowReactions?: boolean;
  // Add other settings here...
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [settings, setSettings] = useState<AdminSettings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<PartySocket | null>(null);

  // --- Authentication ---
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setError(null);
      // Connect to PartyKit after auth
      connectToParty();
    } else {
      setError('Incorrect password.');
    }
  };

  // --- PartyKit Connection ---
  const connectToParty = () => {
     console.log(`Connecting to ws://${partykitHost}/party/admin-settings`);
     // Use a dedicated room for settings or the main room? For now, main room.
     const ws = new PartySocket({
       host: partykitHost,
       room: 'yodie-main-room', // Or a dedicated 'settings' room
     });

     ws.addEventListener('open', () => {
        console.log('Admin connected to PartyKit');
        setSocket(ws);
        // Request current settings after connecting
        ws.send(JSON.stringify({ type: 'getSettings' }));
     });

     ws.addEventListener('message', (event) => {
       try {
         const message = JSON.parse(event.data);
         console.log('Admin received:', message);
         if (message.type === 'settingsUpdate') {
           setSettings(message.settings);
           setIsLoading(false);
         }
       } catch (err) {
         console.error('Failed to parse message:', err);
       }
     });

     ws.addEventListener('close', () => {
        console.log('Admin disconnected');
        setSocket(null);
        // Optional: Maybe require re-auth on disconnect?
        // setIsAuthenticated(false);
     });

     ws.addEventListener('error', (err) => {
        console.error('WebSocket error:', err);
        setError('Connection error.');
        setIsLoading(false);
     });

     return ws; // Return the instance if needed elsewhere immediately
  };

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      socket?.close();
    };
  }, [socket]);


  // --- Settings Management ---
  const handleSettingChange = (key: keyof AdminSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    // Send update to server
    if (socket) {
      socket.send(JSON.stringify({
        type: 'adminUpdate',
        password: ADMIN_PASSWORD, // Send password for server-side validation (improve this!)
        settings: { [key]: value } // Send only the changed setting for now
      }));
    }
  };


  // --- Render Logic ---
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <form onSubmit={handlePasswordSubmit} className="p-8 bg-gray-800 rounded shadow-md">
          <h1 className="text-xl mb-4">Admin Login</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full p-2 mb-4 bg-gray-700 rounded text-white"
          />
          <button type="submit" className="w-full p-2 bg-blue-600 hover:bg-blue-700 rounded">
            Login
          </button>
          {error && <p className="mt-4 text-red-500">{error}</p>}
        </form>
      </div>
    );
  }

  if (isLoading) {
     return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Loading admin settings...</div>;
  }

  return (
    <div className="p-8 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">YodieGang Admin Panel</h1>

       {/* General Settings */}
       <section className="mb-8 p-4 bg-gray-800 rounded">
         <h2 className="text-xl font-semibold mb-4">General Settings</h2>
         <div className="mb-4">
           <label htmlFor="welcomeMessage" className="block mb-2">Welcome Message:</label>
           <input
             id="welcomeMessage"
             type="text"
             value={settings.welcomeMessage || ''}
             onChange={(e) => handleSettingChange('welcomeMessage', e.target.value)}
             className="w-full p-2 bg-gray-700 rounded"
             placeholder="Default welcome message"
           />
         </div>
         {/* Add more general settings here */}
       </section>

       {/* Feature Flags */}
        <section className="mb-8 p-4 bg-gray-800 rounded">
          <h2 className="text-xl font-semibold mb-4">Feature Flags</h2>
          <div className="flex items-center mb-4">
            <input
              id="allowMediaUploads"
              type="checkbox"
              checked={settings.allowMediaUploads ?? true} // Default to true if not set
              onChange={(e) => handleSettingChange('allowMediaUploads', e.target.checked)}
              className="mr-2 h-4 w-4"
            />
            <label htmlFor="allowMediaUploads">Allow Media Uploads</label>
          </div>
           <div className="flex items-center mb-4">
            <input
              id="allowReactions"
              type="checkbox"
              checked={settings.allowReactions ?? true} // Default to true if not set
              onChange={(e) => handleSettingChange('allowReactions', e.target.checked)}
              className="mr-2 h-4 w-4"
            />
            <label htmlFor="allowReactions">Allow Message Reactions</label>
          </div>
          {/* Add more feature flags here */}
        </section>

      {/* Appearance/Themes - Placeholder */}
      <section className="mb-8 p-4 bg-gray-800 rounded">
        <h2 className="text-xl font-semibold mb-4">Appearance</h2>
        <p className="text-gray-400">(Theme controls coming soon)</p>
      </section>

      {/* User Management - Placeholder */}
      <section className="p-4 bg-gray-800 rounded">
        <h2 className="text-xl font-semibold mb-4">User Management</h2>
        <p className="text-gray-400">(User banning/roles coming soon)</p>
      </section>

      {/* Add more sections as needed */}

    </div>
  );
}
