'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as Party from 'partysocket';
import { debounce } from 'lodash';

// Types
interface ColorScheme {
  primary: string;
  secondary: string;
  background: string;
  text: string;
}

interface User {
  id: string;
  name: string;
  lastSeen: number;
  isTyping: boolean;
  rankingScore?: number;
}

interface BaseMessage {
  id: string;
  type: string;
  sender: string;
  timestamp: number;
}

interface TextMessage extends BaseMessage {
  type: "text";
  text: string;
  replyTo?: string;
  reactions?: { [emoji: string]: string[] };
  readBy?: string[];
  ratings?: { [raterUserId: string]: number };
  ratingScore?: number;
}

interface MediaMessage extends BaseMessage {
  type: "media";
  mediaType: "image" | "video" | "audio";
  url: string;
  caption?: string;
  replyTo?: string;
  reactions?: { [emoji: string]: string[] };
  readBy?: string[];
  ratings?: { [raterUserId: string]: number };
  ratingScore?: number;
}

type Message = TextMessage | MediaMessage;

const defaultColorScheme: ColorScheme = {
  primary: 'from-purple-600 to-blue-600',
  secondary: 'from-purple-900 via-indigo-800 to-blue-900',
  background: 'bg-black/30',
  text: 'text-white'
};

const EMOJI_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const RATING_BLINKERS = 1;
const RATING_HARSH = -1;

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [username, setUsername] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(defaultColorScheme);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null); // message ID

  const socketRef = useRef<Party.default | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageRefs = useRef<Map<string, HTMLElement>>(new Map());
  const observer = useRef<IntersectionObserver | null>(null);

  // Typing indicator logic
  const sendTypingStatus = useCallback(debounce((isTyping: boolean) => {
    if (!socketRef.current || !username) return;
    socketRef.current.send(JSON.stringify({
      type: 'system',
      action: 'typing',
      sender: username,
      isTyping
    }));
  }, 500), [username]);

  useEffect(() => {
    if (!username) return;

    socketRef.current = new Party.default({
      host: process.env.NEXT_PUBLIC_PARTYKIT_HOST || 'localhost:1999',
      room: 'main'
    });

    socketRef.current.addEventListener('open', () => {
      setIsConnected(true);
      // Announce joining
      socketRef.current?.send(JSON.stringify({
        type: 'system',
        action: 'joined',
        sender: username,
        timestamp: Date.now()
      }));
    });

    socketRef.current.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'system') {
        switch (data.action) {
          case 'userList':
            const userMap = new Map<string, User>();
            data.users.forEach((user: User) => userMap.set(user.id, user));
            setUsers(data.users);
            break;
          case 'read':
            setMessages(prev => prev.map(msg => {
              if (msg.id === data.targetMessageId) {
                const readBy = msg.readBy || [];
                if (!readBy.includes(data.sender)) {
                  return { ...msg, readBy: [...readBy, data.sender] };
                }
              }
              return msg;
            }));
            break;
          case 'reaction':
            setMessages(prev => prev.map(msg => {
              if (msg.id === data.targetMessageId) {
                const reactions = { ...(msg.reactions || {}) };
                if (!reactions[data.reaction]) reactions[data.reaction] = [];
                if (!reactions[data.reaction].includes(data.sender)) {
                  reactions[data.reaction] = [...reactions[data.reaction], data.sender];
                }
                return { ...msg, reactions };
              }
              return msg;
            }));
            break;
          case 'messageRatingUpdate':
            setMessages(prev => prev.map(msg => msg.id === data.targetMessageId ? { ...msg, ratings: data.ratings, ratingScore: data.ratingScore } : msg));
            break;
          case 'userRankingUpdate':
            setUsers(prev => prev.map(u => u.id === data.userId ? { ...u, rankingScore: data.rankingScore } : u));
            break;
        }
      } else {
        setMessages((prev) => {
          // Avoid duplicates
          if (prev.find(m => m.id === data.id)) return prev;
          return [...prev, data];
        });
      }
    });

    socketRef.current.addEventListener('close', () => {
      setIsConnected(false);
      setUsers([]);
    });

    return () => {
      socketRef.current?.send(JSON.stringify({
        type: 'system',
        action: 'left',
        sender: username,
        timestamp: Date.now()
      }));
      socketRef.current?.close();
      sendTypingStatus.cancel();
    };
  }, [username, sendTypingStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Read receipt logic using Intersection Observer
  useEffect(() => {
    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const messageId = entry.target.getAttribute('data-message-id');
          const message = messages.find(m => m.id === messageId);
          if (messageId && message && message.sender !== username && (!message.readBy || !message.readBy.includes(username))) {
            socketRef.current?.send(JSON.stringify({
              type: 'system',
              action: 'read',
              targetMessageId: messageId,
              sender: username,
              timestamp: Date.now()
            }));
            // Optionally visually mark as read immediately on client
            // setMessages(prev => prev.map(m => m.id === messageId ? {...m, readBy: [...(m.readBy || []), username]} : m));
          }
        }
      });
    };

    observer.current = new IntersectionObserver(handleIntersect, {
      root: null, // viewport
      rootMargin: '0px',
      threshold: 0.5 // 50% visible
    });

    messageRefs.current.forEach(ref => observer.current?.observe(ref));

    return () => {
      observer.current?.disconnect();
      messageRefs.current.clear();
    };
  }, [messages, username]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setMediaPreview(objectUrl);
    // No immediate send here, wait for submit button
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socketRef.current || (!input.trim() && !mediaPreview)) return;

    let messageData: Partial<Message> = {
      id: crypto.randomUUID(),
      sender: username,
      timestamp: Date.now(),
      replyTo: replyingTo?.id
    };

    if (mediaPreview && fileInputRef.current?.files?.[0]) {
      const file = fileInputRef.current.files[0];
      const base64String = await toBase64(file);
      messageData = {
        ...messageData,
        type: 'media',
        mediaType: file.type.startsWith('image/') ? 'image' : 
                    file.type.startsWith('video/') ? 'video' : 'audio',
        url: base64String,
        caption: input
      };
    } else {
      messageData = {
        ...messageData,
        type: 'text',
        text: input
      };
    }

    socketRef.current.send(JSON.stringify(messageData));
    setInput('');
    setMediaPreview(null);
    setReplyingTo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    sendTypingStatus(false);
  };

  const handleReaction = (messageId: string, emoji: string) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({
      type: 'system',
      action: 'reaction',
      targetMessageId: messageId,
      reaction: emoji,
      sender: username,
      timestamp: Date.now()
    }));
    setShowEmojiPicker(null);
  }

  const rateMessage = (messageId: string, rating: number) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({
      type: 'clientAction',
      action: 'rateMessage',
      targetMessageId: messageId,
      rating: rating // Send RATING_BLINKERS or RATING_HARSH
    }));
  }

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });

  const findMessageById = (id: string): Message | undefined => {
    return messages.find(m => m.id === id);
  }

  const renderMessage = (msg: Message) => {
    const isOwn = msg.sender === username;
    const messageClass = isOwn ? 'justify-end' : 'justify-start';
    const bubbleClass = isOwn 
      ? `bg-gradient-to-r ${colorScheme.primary} ${colorScheme.text}` 
      : `${colorScheme.background} backdrop-blur-sm ${colorScheme.text}/90`;
    const repliedTo = msg.replyTo ? findMessageById(msg.replyTo) : null;

    return (
      <div 
        className={`flex ${messageClass} group relative`} 
        ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}
        data-message-id={msg.id}
      >
        <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${bubbleClass} relative`}>
          {/* Reply Context */}
          {repliedTo && (
            <div className="border-l-4 border-purple-400 pl-2 mb-2 opacity-80 text-sm">
              <p className="font-semibold">{repliedTo.sender}</p>
              <p className="truncate">
                {repliedTo.type === 'text' ? repliedTo.text : 
                 repliedTo.type === 'media' ? repliedTo.caption || repliedTo.mediaType : ''}
              </p>
            </div>
          )}
          
          {/* Sender & Content */}  
          <p className="text-sm font-semibold opacity-90">{msg.sender}</p>
          {msg.type === 'text' ? (
            <p className="text-lg break-words">{msg.text}</p>
          ) : (
            <div className="space-y-2">
              {msg.mediaType === 'image' && (
                <img src={msg.url} alt={msg.caption || 'Image'} className="rounded-lg max-h-96 w-auto cursor-pointer" onClick={() => window.open(msg.url, '_blank')} />
              )}
              {msg.mediaType === 'video' && (
                <video src={msg.url} controls className="rounded-lg max-h-96 w-auto" />
              )}
              {msg.mediaType === 'audio' && (
                <audio src={msg.url} controls className="w-full" />
              )}
              {msg.caption && <p className="text-sm opacity-90 mt-1">{msg.caption}</p>}
            </div>
          )}

          {/* Timestamp & Read Receipt */}  
          <div className="flex justify-end items-center mt-1">
            <p className="text-xs opacity-75 mr-1">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </p>
            {isOwn && (
              <span className={`text-xs ${msg.readBy && msg.readBy.length > 0 ? 'text-blue-400' : 'opacity-75'}`}>
                ✓{msg.readBy && msg.readBy.length > 0 ? '✓' : ''}
              </span>
            )}
          </div>
          
          {/* Reactions */}  
          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(msg.reactions).map(([emoji, usersReacted]) => (
                <span key={emoji} className="text-xs bg-black/20 rounded-full px-2 py-0.5 cursor-default" title={usersReacted.join(', ')}>
                  {emoji} {usersReacted.length}
                </span>
              ))}
            </div>
          )}

          {/* Ratings */}  
          {msg.ratings && Object.keys(msg.ratings).length > 0 && (
            <div className="flex items-center justify-start mt-1">
              <span className={`text-xs font-semibold ${(msg.ratingScore ?? 0) > 0 ? 'text-green-600' : (msg.ratingScore ?? 0) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                [{(msg.ratingScore ?? 0) > 0 ? '+' : ''}{msg.ratingScore ?? 0}]
              </span>
              <button
                onClick={() => rateMessage(msg.id, RATING_BLINKERS)}
                className={`px-1 py-0.5 rounded text-xs transition-colors ${(msg.ratings?.[username] ?? 0) === RATING_BLINKERS ? 'bg-green-200 border border-green-400' : 'bg-gray-200 border-gray-300 hover:bg-green-100'}`}
                title="Blinkers (+1)"
              >
                ✨
              </button>
              <button
                onClick={() => rateMessage(msg.id, RATING_HARSH)}
                className={`px-1 py-0.5 rounded text-xs transition-colors ${(msg.ratings?.[username] ?? 0) === RATING_HARSH ? 'bg-red-200 border border-red-400' : 'bg-gray-200 border-gray-300 hover:bg-red-100'}`}
                title="Harsh (-1)"
              >
                💩
              </button>
            </div>
          )}

          {/* Action Buttons (Reply/React) - Show on hover */} 
          <div className="absolute top-0 right-0 flex opacity-0 group-hover:opacity-100 transition-opacity -mt-4 mr-1 bg-black/40 backdrop-blur-sm rounded-full p-1 space-x-1">
            <button 
              onClick={() => setReplyingTo(msg)}
              className="text-xs p-1 rounded-full hover:bg-white/20" 
              title="Reply"
            >↩️</button>
            <button 
              onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)}
              className="text-xs p-1 rounded-full hover:bg-white/20" 
              title="React"
            >😊</button>
          </div>
          
          {/* Emoji Picker */} 
          {showEmojiPicker === msg.id && (
            <div className="absolute z-10 bottom-full mb-1 right-0 bg-black/60 backdrop-blur-md rounded-lg p-2 flex gap-1 shadow-lg">
              {EMOJI_REACTIONS.map(emoji => (
                <button 
                  key={emoji} 
                  onClick={() => handleReaction(msg.id, emoji)}
                  className="text-lg p-1 hover:bg-white/20 rounded-md"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRatings = (msg: Message) => {
    const score = msg.ratingScore ?? 0; 
    const userRating = msg.ratings?.[username]; 

    if (msg.sender === username) {
      return score !== 0 ? <span className={`ml-2 text-xs font-semibold ${score > 0 ? 'text-green-600' : 'text-red-600'}`}>[{score > 0 ? '+' : ''}{score}]</span> : null;
    }

    return (
      <div className="flex items-center space-x-1 ml-2">
        {score !== 0 && <span className={`text-xs font-semibold ${score > 0 ? 'text-green-600' : 'text-red-600'}`}>[{score > 0 ? '+' : ''}{score}]</span>}

        <button
          onClick={() => rateMessage(msg.id, RATING_BLINKERS)}
          className={`px-1 py-0.5 rounded text-xs transition-colors ${userRating === RATING_BLINKERS ? 'bg-green-200 border border-green-400' : 'bg-gray-200 border-gray-300 hover:bg-green-100'}`}
          title="Blinkers (+1)"
          disabled={!username || msg.sender === username} 
        >
          ✨
        </button>

        <button
          onClick={() => rateMessage(msg.id, RATING_HARSH)}
          className={`px-1 py-0.5 rounded text-xs transition-colors ${userRating === RATING_HARSH ? 'bg-red-200 border border-red-400' : 'bg-gray-200 border-gray-300 hover:bg-red-100'}`}
          title="Harsh (-1)"
          disabled={!username || msg.sender === username} 
        >
          💩
        </button>
      </div>
    );
  };

  // Calculate typing users
  const typingUsers = Array.from(users.values())
    .filter(u => u.isTyping && u.name !== username)
    .map(u => u.name);

  if (!username) {
    // Login Screen (unchanged)
    return (
      <div className={`min-h-screen bg-gradient-to-br ${colorScheme.secondary} flex items-center justify-center p-4`}>
        <div className={`${colorScheme.background} backdrop-blur-lg p-8 rounded-2xl shadow-2xl w-full max-w-md border border-white/10`}>
          <h1 className={`text-4xl font-bold mb-2 ${colorScheme.text} text-center`}>YodieGang.com</h1>
          <p className="text-gray-300 text-center mb-8">Yo at the bros and ho's 🔥</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.username as HTMLInputElement;
            setUsername(input.value);
          }}>
            <input
              type="text"
              name="username"
              placeholder="What's your name fam?"
              className={`w-full p-4 ${colorScheme.background} border border-white/20 rounded-lg mb-4 ${colorScheme.text} placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500`}
              required
            />
            <button
              type="submit"
              className={`w-full bg-gradient-to-r ${colorScheme.primary} ${colorScheme.text} p-4 rounded-lg font-bold hover:opacity-90 transition-all duration-200 transform hover:scale-[1.02]`}
            >
              Enter the Gang
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col bg-gradient-to-br ${colorScheme.secondary}`}>
      {/* Header */}  
      <div className={`flex-none p-4 border-b border-white/10 ${colorScheme.background} backdrop-blur-md`}>
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className={`text-2xl font-bold ${colorScheme.text}`}>YodieGang.com</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="text-purple-300 hover:text-white transition-colors text-sm flex items-center gap-1"
            >
              <span className="text-lg">🎨</span> Theme
            </button>
            {/* User List Dropdown (Simple Example) */}  
            <div className="relative group">
              <span className="text-purple-300 cursor-default">Online: {users.length}</span>
              <div className="absolute hidden group-hover:block right-0 mt-1 w-48 bg-black/70 backdrop-blur-lg rounded-md shadow-lg p-2 z-20 border border-white/10">
                {Array.from(users.values()).map(u => (
                  <p key={u.id} className={`text-sm ${colorScheme.text} ${u.name === username ? 'font-bold' : ''}`}>
                    {u.name} {u.isTyping ? '(typing...)' : ''}
                  </p>
                ))}
              </div>
            </div>
            <p className="text-purple-300">Yo'd in as {username}</p>
          </div>
        </div>
      </div>

      {/* Color Picker */}  
      {showColorPicker && (
        <div className={`${colorScheme.background} backdrop-blur-md p-4 border-b border-white/10`}>
          <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Color Selectors (unchanged) */}
            <div>
              <label className="text-sm text-gray-300">Primary Gradient</label>
              <select
                value={colorScheme.primary}
                onChange={(e) => setColorScheme({...colorScheme, primary: e.target.value})}
                className="mt-1 block w-full rounded-md bg-white/10 border border-white/20 text-white p-2"
              >
                <option value="from-purple-600 to-blue-600">Purple to Blue</option>
                <option value="from-pink-600 to-rose-600">Pink to Rose</option>
                <option value="from-green-600 to-teal-600">Green to Teal</option>
                <option value="from-yellow-600 to-red-600">Yellow to Red</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-300">Background Gradient</label>
              <select
                value={colorScheme.secondary}
                onChange={(e) => setColorScheme({...colorScheme, secondary: e.target.value})}
                className="mt-1 block w-full rounded-md bg-white/10 border border-white/20 text-white p-2"
              >
                <option value="from-purple-900 via-indigo-800 to-blue-900">Purple Night</option>
                <option value="from-rose-900 via-pink-800 to-red-900">Rose Garden</option>
                <option value="from-emerald-900 via-teal-800 to-green-900">Emerald Forest</option>
                <option value="from-amber-900 via-orange-800 to-yellow-900">Sunset</option>
              </select>
            </div>
          </div>
        </div>
      )}
      
      {/* Chat Area */}  
      <div className="flex-1 overflow-hidden relative">
        <div className="h-full max-w-7xl mx-auto p-4 overflow-y-auto scroll-smooth">
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id}>{renderMessage(msg)}</div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
        {/* Typing Indicator */}  
        {typingUsers.length > 0 && (
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 mb-2">
            <span className="text-sm text-gray-400 bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full">
              {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </span>
          </div>
        )}
      </div>

      {/* Input Area */}  
      <div className={`flex-none p-4 ${colorScheme.background} backdrop-blur-md border-t border-white/10`}>
        {/* Reply Context Bar */}  
        {replyingTo && (
          <div className="mb-2 p-2 border-l-4 border-purple-400 bg-black/20 rounded-md flex justify-between items-center">
            <div>
              <p className="text-sm font-semibold">Replying to {replyingTo.sender}</p>
              <p className="text-sm opacity-80 truncate">
                {replyingTo.type === 'text' ? replyingTo.text : replyingTo.caption || replyingTo.mediaType}
              </p>
            </div>
            <button onClick={() => setReplyingTo(null)} className="text-red-400 hover:text-red-600 text-xl">&times;</button>
          </div>
        )}
        <form onSubmit={sendMessage} className="max-w-7xl mx-auto">
          <div className="flex gap-3 items-center">
            {/* File Upload Button */}  
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,video/*,audio/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach File"
              className={`p-3 ${colorScheme.background} border border-white/20 rounded-xl hover:bg-white/10 transition-colors flex items-center justify-center aspect-square`}
            >
              <span className="text-xl">📎</span>
            </button>
            {/* Text Input */}  
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                sendTypingStatus(true);
              }}
              onBlur={() => sendTypingStatus(false)}
              placeholder={mediaPreview ? "Add a caption..." : "Yo something..."}
              className={`flex-1 p-4 ${colorScheme.background} border border-white/20 rounded-xl ${colorScheme.text} placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500`}
            />
            {/* Send Button */}  
            <button
              type="submit"
              className={`px-8 py-4 bg-gradient-to-r ${colorScheme.primary} ${colorScheme.text} rounded-xl font-bold hover:opacity-90 transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
              disabled={!isConnected || (!input.trim() && !mediaPreview)}
            >
              Yo!
            </button>
          </div>
          {/* Media Preview */}  
          {mediaPreview && (
            <div className="mt-2 relative w-fit">
              <img src={mediaPreview} alt="Preview" className="h-20 rounded-lg" />
              <button
                type="button"
                onClick={() => {
                  setMediaPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                title="Remove Attachment"
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-md"
              >
                &times;
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
