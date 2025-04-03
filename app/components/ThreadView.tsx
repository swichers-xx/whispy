'use client';

import React, { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  type: string;
  sender: string;
  timestamp: number;
  threadId?: string;
  [key: string]: any;
}

interface ThreadViewProps {
  threadId: string;
  threadStarter: Message;
  messages: Message[];
  currentUser: string;
  onClose: () => void;
  onSendReply: (text: string, threadId: string) => void;
}

const ThreadView: React.FC<ThreadViewProps> = ({
  threadId,
  threadStarter,
  messages,
  currentUser,
  onClose,
  onSendReply
}) => {
  const [replyText, setReplyText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Filter messages that belong to this thread
  const threadMessages = messages.filter(msg => msg.threadId === threadId);
  
  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages.length]);
  
  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (replyText.trim()) {
      onSendReply(replyText, threadId.toString()); // Ensure threadId is always a string
      setReplyText('');
    }
  };
  
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  
  return (
    <div className="thread-view fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Thread</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>
        
        {/* Thread starter message */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-start">
            <div className="flex-1">
              <div className="flex items-center">
                <span className="font-medium">{threadStarter.sender}</span>
                <span className="text-xs text-gray-400 ml-2">{formatTime(threadStarter.timestamp)}</span>
              </div>
              {threadStarter.type === 'text' ? (
                <div className="mt-1" dangerouslySetInnerHTML={{ __html: threadStarter.formattedText ? threadStarter.text : `<p>${threadStarter.text}</p>` }} />
              ) : (
                <div className="mt-1">
                  {threadStarter.mediaType === 'image' && (
                    <img src={threadStarter.url} alt="Image" className="max-h-40 rounded-lg" />
                  )}
                  {(threadStarter.mediaType === 'audio' || threadStarter.mediaType === 'voice') && (
                    <audio src={threadStarter.url} controls className="w-full" />
                  )}
                  {threadStarter.caption && <p className="mt-1 text-sm">{threadStarter.caption}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Thread replies */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {threadMessages
            .filter(msg => msg.id !== threadStarter.id) // Exclude the starter message
            .sort((a, b) => a.timestamp - b.timestamp) // Sort by timestamp
            .map(msg => (
              <div key={msg.id} className={`flex ${msg.sender === currentUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg p-3 ${
                  msg.sender === currentUser ? 'bg-blue-600' : 'bg-gray-800'
                }`}>
                  <div className="flex items-center">
                    <span className="font-medium">{msg.sender}</span>
                    <span className="text-xs text-gray-300 ml-2">{formatTime(msg.timestamp)}</span>
                  </div>
                  {msg.type === 'text' ? (
                    <div className="mt-1" dangerouslySetInnerHTML={{ __html: msg.formattedText ? msg.text : `<p>${msg.text}</p>` }} />
                  ) : (
                    <div className="mt-1">
                      {msg.mediaType === 'image' && (
                        <img src={msg.url} alt="Image" className="max-h-40 rounded-lg" />
                      )}
                      {(msg.mediaType === 'audio' || msg.mediaType === 'voice') && (
                        <audio src={msg.url} controls className="w-full" />
                      )}
                      {msg.caption && <p className="mt-1 text-sm">{msg.caption}</p>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Reply input */}
        <div className="p-4 border-t border-gray-800">
          <form onSubmit={handleSendReply} className="flex">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Reply to thread..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-l-lg px-4 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!replyText.trim()}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-r-lg disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ThreadView;
