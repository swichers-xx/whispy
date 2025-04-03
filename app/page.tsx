'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as Party from 'partysocket';
import { debounce } from 'lodash';
import RichTextEditor from './components/RichTextEditor';
import VoiceRecorder from './components/VoiceRecorder';
import ThreadView from './components/ThreadView';

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
  expiresAt?: number;
  maxViews?: number;
  viewCount?: number;
  requireConfirmation?: boolean;
  isHidden?: boolean;
  oneTimeView?: boolean;
  viewedBy?: string[];
  threadId?: string; // ID of the thread this message belongs to
  isThreadStarter?: boolean; // Whether this message starts a thread
  threadMessageCount?: number; // Count of messages in this thread
}

interface TextMessage extends BaseMessage {
  type: "text";
  text: string;
  formattedText?: boolean; // Whether the text contains formatting
  replyTo?: string;
  reactions?: { [emoji: string]: string[] };
  readBy?: string[];
  ratings?: { [raterUserId: string]: number };
  ratingScore?: number;
  dopeLevel?: string;
  dopeEmoji?: string;
}

interface MediaMessage extends BaseMessage {
  type: "media";
  mediaType: "image" | "video" | "audio" | "voice"; // Added voice type
  url: string;
  duration?: number; // Duration in seconds for audio/voice messages
  caption?: string;
  replyTo?: string;
  reactions?: { [emoji: string]: string[] };
  readBy?: string[];
  ratings?: { [raterUserId: string]: number };
  ratingScore?: number;
  dopeLevel?: string;
  dopeEmoji?: string;
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
  const [formattedInput, setFormattedInput] = useState('');
  const [isFormattedText, setIsFormattedText] = useState(false);
  const [username, setUsername] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(defaultColorScheme);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null); // message ID
  const [showSelfDestructOptions, setShowSelfDestructOptions] = useState(false);
  const [expirationTime, setExpirationTime] = useState<number | null>(null);
  const [maxViews, setMaxViews] = useState<number | null>(null);
  const [requireConfirmation, setRequireConfirmation] = useState(false);
  const [oneTimeView, setOneTimeView] = useState(false);
  const [pendingViewConfirmations, setPendingViewConfirmations] = useState<string[]>([]);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [useRichTextEditor, setUseRichTextEditor] = useState(false);

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

    // Close any existing connection
    if (socketRef.current) {
      socketRef.current.close();
    }

    console.log("Connecting to PartyKit server:", process.env.NEXT_PUBLIC_PARTYKIT_HOST || 'localhost:1999');
    
    socketRef.current = new Party.default({
      host: process.env.NEXT_PUBLIC_PARTYKIT_HOST || 'localhost:1999',
      room: 'main'
    });

    socketRef.current.addEventListener('open', () => {
      console.log("Socket connection opened");
      setIsConnected(true);
      // Announce joining
      socketRef.current?.send(JSON.stringify({
        type: 'clientAction',
        action: 'join',
        sender: username,
        timestamp: Date.now()
      }));
    });

    socketRef.current.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received message:", data.type);
        
        if (data.type === 'systemInfo' || data.type === 'system') {
          switch (data.action) {
            case 'userList':
              console.log("Received user list:", data.users);
              if (Array.isArray(data.users)) {
                setUsers(data.users);
              }
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
            case 'reactionUpdate':
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
            case 'messageExpired':
              setMessages(prev => prev.map(msg => 
                msg.id === data.targetMessageId ? { ...msg, isHidden: true } : msg
              ));
              break;
            case 'messageViewed':
              setMessages(prev => prev.map(msg => {
                if (msg.id === data.targetMessageId) {
                  return { 
                    ...msg, 
                    viewCount: (msg.viewCount || 0) + 1,
                    isHidden: msg.maxViews ? (msg.viewCount || 0) + 1 >= msg.maxViews : false
                  };
                }
                return msg;
              }));
              break;
            case 'confirmView':
              // Add message to pending confirmations
              setPendingViewConfirmations(prev => [...prev, data.targetMessageId]);
              break;
            case 'messageAlreadyViewed':
              // Mark the message as already viewed by this user
              setMessages(prev => prev.map(msg => {
                if (msg.id === data.targetMessageId) {
                  // If viewedBy doesn't exist, create it
                  const viewedBy = msg.viewedBy || [];
                  // Add current user to viewedBy if not already there
                  if (!viewedBy.includes(username)) {
                    return { 
                      ...msg, 
                      viewedBy: [...viewedBy, username]
                    };
                  }
                }
                return msg;
              }));
              break;
            case 'threadUpdate':
              // Update thread message count for the thread starter
              if (data.threadId) {
                setMessages(prev => prev.map(msg => {
                  if (msg.threadId === data.threadId && msg.isThreadStarter) {
                    return {
                      ...msg,
                      threadMessageCount: data.threadMessageCount
                    };
                  }
                  return msg;
                }));
              }
              break;
          }
        } else if (data.type === 'text' || data.type === 'media') {
          // Handle regular messages
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.find(m => m.id === data.id)) return prev;
            return [...prev, data];
          });
          
          // If message requires confirmation, don't automatically view it
          if (!data.requireConfirmation && data.maxViews && data.sender !== username) {
            // Send view notification
            socketRef.current?.send(JSON.stringify({
              type: 'clientAction',
              action: 'viewMessage',
              targetMessageId: data.id,
              timestamp: Date.now()
            }));
          }
        } else if (data.type === 'settingsUpdate') {
          // Handle settings updates if needed
          console.log("Received settings update");
        }
      } catch (error) {
        console.error("Error parsing message:", error, event.data);
      }
    });

    socketRef.current.addEventListener('close', () => {
      console.log("Socket connection closed");
      setIsConnected(false);
    });

    socketRef.current.addEventListener('error', (error) => {
      console.error("Socket error:", error);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.send(JSON.stringify({
          type: 'clientAction',
          action: 'left',
          sender: username,
          timestamp: Date.now()
        }));
        socketRef.current.close();
      }
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
    if (!socketRef.current || (!input.trim() && !formattedInput.trim() && !mediaPreview)) return;

    let messageData: Partial<Message> = {
      id: crypto.randomUUID(),
      sender: username,
      timestamp: Date.now(),
      replyTo: replyingTo?.id
    };

    // Add thread ID if replying in a thread
    if (activeThreadId) {
      messageData.threadId = activeThreadId;
    }

    // Add self-destruct options if enabled
    if (expirationTime) {
      messageData.expiresAt = Date.now() + expirationTime * 1000; // Convert seconds to milliseconds
    }
    
    if (maxViews && maxViews > 0) {
      messageData.maxViews = maxViews;
      messageData.viewCount = 0;
    }
    
    if (requireConfirmation) {
      messageData.requireConfirmation = true;
    }
    
    if (oneTimeView) {
      messageData.oneTimeView = true;
      messageData.viewedBy = [];
    }

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
      // Use formatted text if rich text editor is enabled
      messageData = {
        ...messageData,
        type: 'text',
        text: useRichTextEditor ? formattedInput : input,
        formattedText: useRichTextEditor && isFormattedText
      };
    }

    socketRef.current.send(JSON.stringify(messageData));
    setInput('');
    setFormattedInput('');
    setIsFormattedText(false);
    setMediaPreview(null);
    setReplyingTo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    sendTypingStatus(false);
    
    // Reset self-destruct options
    setExpirationTime(null);
    setMaxViews(null);
    setRequireConfirmation(false);
    setOneTimeView(false);
    setShowSelfDestructOptions(false);
    
    // Close voice recorder if open
    setShowVoiceRecorder(false);
    
    // Close thread view if sending from thread
    if (activeThreadId) {
      setActiveThreadId(null);
    }
  };

  const confirmViewMessage = (messageId: string) => {
    if (!socketRef.current) return;
    
    // Send confirmation
    socketRef.current.send(JSON.stringify({
      type: 'clientAction',
      action: 'confirmView',
      targetMessageId: messageId,
      timestamp: Date.now()
    }));
    
    // Remove from pending confirmations
    setPendingViewConfirmations(prev => prev.filter(id => id !== messageId));
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
    
    // Check if message is hidden (expired or max views reached)
    if (msg.isHidden) {
      return (
        <div className={`flex ${messageClass} group relative opacity-50`}>
          <div className={`max-w-[80%] rounded-2xl px-4 py-3 bg-gray-800 text-gray-400 relative`}>
            <p className="text-sm font-semibold opacity-90">{msg.sender}</p>
            <p className="text-lg italic">This message is no longer available</p>
            <div className="text-xs mt-1">
              {msg.expiresAt ? "Message expired" : msg.oneTimeView && msg.viewedBy?.includes(username) ? "You've already viewed this message" : "View limit reached"}
            </div>
          </div>
        </div>
      );
    }
    
    // Check if message requires confirmation
    if (msg.requireConfirmation && pendingViewConfirmations.includes(msg.id)) {
      return (
        <div className={`flex ${messageClass} group relative`}>
          <div className={`max-w-[80%] rounded-2xl px-4 py-3 bg-yellow-800 text-white relative`}>
            <p className="text-sm font-semibold opacity-90">{msg.sender}</p>
            <p className="text-lg">This message requires confirmation to view</p>
            <div className="flex justify-end mt-2">
              <button 
                onClick={() => confirmViewMessage(msg.id)}
                className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-white"
              >
                View Message
              </button>
            </div>
          </div>
        </div>
      );
    }

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
            <div className="text-lg break-words">
              {msg.formattedText ? (
                <div dangerouslySetInnerHTML={{ __html: msg.text }} />
              ) : (
                <p>{msg.text}</p>
              )}
            </div>
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
              {msg.mediaType === 'voice' && (
                <div className="flex items-center space-x-2">
                  <audio src={msg.url} controls className="w-full" />
                  {msg.duration && <span className="text-xs">{Math.floor(msg.duration / 60)}:{(msg.duration % 60).toString().padStart(2, '0')}</span>}
                </div>
              )}
              {msg.caption && <p className="text-sm opacity-90 mt-1">{msg.caption}</p>}
            </div>
          )}

          {/* Thread indicator */}
          {(msg.isThreadStarter || msg.threadId) && (
            <div 
              className="mt-1 flex items-center text-xs space-x-1 cursor-pointer hover:underline"
              onClick={() => setActiveThreadId(msg.threadId || null)}
            >
              <span className="text-blue-300">
                {msg.isThreadStarter ? 
                  `${msg.threadMessageCount || 1} ${(msg.threadMessageCount || 1) > 1 ? 'replies' : 'reply'}` : 
                  'View thread'}
              </span>
            </div>
          )}

          {/* Self-destruct indicators */}
          {(msg.expiresAt || msg.maxViews || msg.oneTimeView) && (
            <div className="mt-1 flex items-center text-xs space-x-2">
              {msg.expiresAt && (
                <span className="bg-red-900/30 px-2 py-0.5 rounded-full">
                  Expires: {new Date(msg.expiresAt).toLocaleTimeString()}
                </span>
              )}
              {msg.maxViews && (
                <span className="bg-orange-900/30 px-2 py-0.5 rounded-full">
                  Views: {msg.viewCount || 0}/{msg.maxViews}
                </span>
              )}
              {msg.oneTimeView && (
                <span className="bg-purple-900/30 px-2 py-0.5 rounded-full flex items-center">
                  <span className="mr-1">👁️</span> One-time view
                  {msg.viewedBy && msg.viewedBy.length > 0 && ` (${msg.viewedBy.length} users)`}
                </span>
              )}
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
                disabled={!username || msg.sender === username} 
              >
                ✨
              </button>
              <button
                onClick={() => rateMessage(msg.id, RATING_HARSH)}
                className={`px-1 py-0.5 rounded text-xs transition-colors ${(msg.ratings?.[username] ?? 0) === RATING_HARSH ? 'bg-red-200 border border-red-400' : 'bg-gray-200 border-gray-300 hover:bg-red-100'}`}
                title="Harsh (-1)"
                disabled={!username || msg.sender === username} 
              >
                💩
              </button>
            </div>
          )}

          {/* Action Buttons (Reply/React/Thread) - Show on hover */} 
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
            <button 
              onClick={() => createThread(msg.id)}
              className="text-xs p-1 rounded-full hover:bg-white/20" 
              title="Create thread"
            >🧵</button>
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

  const handleVoiceRecordingComplete = async (audioBlob: Blob, duration: number) => {
    if (!socketRef.current) return;
    
    // Convert Blob to base64
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve) => {
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(base64String);
      };
    });
    reader.readAsDataURL(audioBlob);
    
    const base64String = await base64Promise;
    
    const messageData: Partial<Message> = {
      id: crypto.randomUUID(),
      sender: username,
      timestamp: Date.now(),
      replyTo: replyingTo?.id,
      type: 'media',
      mediaType: 'voice',
      url: base64String,
      duration: duration,
      caption: input
    };
    
    // Add thread ID if replying in a thread
    if (activeThreadId) {
      messageData.threadId = activeThreadId;
    }
    
    // Add self-destruct options if enabled
    if (expirationTime) {
      messageData.expiresAt = Date.now() + expirationTime * 1000;
    }
    
    if (maxViews && maxViews > 0) {
      messageData.maxViews = maxViews;
      messageData.viewCount = 0;
    }
    
    if (requireConfirmation) {
      messageData.requireConfirmation = true;
    }
    
    if (oneTimeView) {
      messageData.oneTimeView = true;
      messageData.viewedBy = [];
    }
    
    socketRef.current.send(JSON.stringify(messageData));
    setInput('');
    setShowVoiceRecorder(false);
    setReplyingTo(null);
    
    // Reset self-destruct options
    setExpirationTime(null);
    setMaxViews(null);
    setRequireConfirmation(false);
    setOneTimeView(false);
    setShowSelfDestructOptions(false);
    
    // Close thread view if sending from thread
    if (activeThreadId) {
      setActiveThreadId(null);
    }
  };

  const createThread = (messageId: string) => {
    if (!socketRef.current) return;
    
    socketRef.current.send(JSON.stringify({
      type: 'clientAction',
      action: 'createThread',
      targetMessageId: messageId,
      timestamp: Date.now()
    }));
    
    // Open the thread view
    const message = messages.find(m => m.id === messageId);
    if (message && message.threadId) {
      setActiveThreadId(message.threadId);
    } else {
      // If no threadId yet, we'll use the message ID as a temporary thread ID
      // until the server assigns a proper one
      setActiveThreadId(messageId);
    }
  };

  const sendThreadReply = (text: string, threadId: string) => {
    if (!socketRef.current || !text.trim()) return;
    
    const messageData: Partial<Message> = {
      id: crypto.randomUUID(),
      sender: username,
      timestamp: Date.now(),
      type: 'text',
      text: text,
      threadId: threadId
    };
    
    socketRef.current.send(JSON.stringify(messageData));
  };

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
            {messages.map((msg, index) => (
              <div key={index}>{renderMessage(msg)}</div>
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
        
        {/* Voice Recorder */}
        {showVoiceRecorder && (
          <VoiceRecorder 
            onRecordingComplete={handleVoiceRecordingComplete}
            onCancel={() => setShowVoiceRecorder(false)}
          />
        )}
        
        {/* Self-destruct options */}
        {showSelfDestructOptions && (
          <div className="mb-4 p-3 bg-gray-800 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium">Self-Destruct Options</h3>
              <button 
                onClick={() => setShowSelfDestructOptions(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1">Expire after (seconds)</label>
                <input 
                  type="number" 
                  min="5"
                  value={expirationTime || ''}
                  onChange={(e) => setExpirationTime(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full bg-gray-700 rounded px-2 py-1 text-sm"
                  placeholder="Never expires"
                />
              </div>
              
              <div>
                <label className="block text-xs mb-1">Maximum views</label>
                <input 
                  type="number" 
                  min="1"
                  value={maxViews || ''}
                  onChange={(e) => setMaxViews(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full bg-gray-700 rounded px-2 py-1 text-sm"
                  placeholder="Unlimited views"
                />
              </div>
              
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  id="requireConfirmation"
                  checked={requireConfirmation}
                  onChange={(e) => setRequireConfirmation(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="requireConfirmation" className="text-xs">Require confirmation before viewing</label>
              </div>
              
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  id="oneTimeView"
                  checked={oneTimeView}
                  onChange={(e) => setOneTimeView(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="oneTimeView" className="text-xs">Each user can only view once</label>
              </div>
            </div>
          </div>
        )}
        
        <form onSubmit={sendMessage} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (fileInputRef.current) fileInputRef.current.click();
            }}
            className="p-2 text-gray-400 hover:text-white"
            title="Upload media"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <button
            type="button"
            onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
            className="p-2 text-gray-400 hover:text-white"
            title="Record voice message"
          >
            🎤
          </button>
          
          <button
            type="button"
            onClick={() => setUseRichTextEditor(!useRichTextEditor)}
            className={`p-2 ${useRichTextEditor ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}
            title="Toggle rich text editor"
          >
            📝
          </button>
          
          {useRichTextEditor ? (
            <RichTextEditor 
              value={formattedInput}
              onChange={(value, isFormatted) => {
                setFormattedInput(value);
                setIsFormattedText(isFormatted);
                if (value.trim()) {
                  sendTypingStatus(true);
                } else {
                  sendTypingStatus(false);
                }
              }}
              className="flex-1 bg-gray-800 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          ) : (
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (e.target.value.trim()) {
                  sendTypingStatus(true);
                } else {
                  sendTypingStatus(false);
                }
              }}
              placeholder="Type a message..."
              className="flex-1 bg-gray-800 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          )}
          <button
            type="button"
            onClick={() => setShowSelfDestructOptions(!showSelfDestructOptions)}
            className={`p-2 text-gray-400 hover:text-white ${showSelfDestructOptions ? 'text-orange-500' : ''}`}
            title="Self-destruct options"
          >
            🔥
          </button>
          <button
            type="submit"
            disabled={!input.trim() && !formattedInput.trim() && !mediaPreview}
            className={`p-2 rounded-full ${!input.trim() && !formattedInput.trim() && !mediaPreview ? 'bg-gray-800 text-gray-600' : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'}`}
          >
            ➤
          </button>
        </form>
      </div>
    </div>
  );

  // Thread View Modal
  {activeThreadId !== null && (
    <ThreadView
      threadId={activeThreadId as string}
      threadStarter={messages.find(m => m.threadId === activeThreadId && m.isThreadStarter) || 
                    messages.find(m => m.id === activeThreadId) || 
                    {
                      id: '',
                      type: 'text',
                      text: 'Thread not found',
                      sender: username,
                      timestamp: Date.now()
                    }}
      messages={messages}
      currentUser={username}
      onClose={() => setActiveThreadId(null)}
      onSendReply={sendThreadReply}
    />
  )}
}
