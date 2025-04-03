'use client';

import React, { useState, useRef, useEffect } from 'react';

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  onCancel: () => void;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onRecordingComplete, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioURL(audioUrl);
        
        // Calculate duration
        const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
        
        // Clean up the stream tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check your permissions.');
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };
  
  const handleSend = () => {
    if (audioChunksRef.current.length > 0) {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
      onRecordingComplete(audioBlob, duration);
    }
  };
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioURL) {
        URL.revokeObjectURL(audioURL);
      }
    };
  }, [audioURL]);
  
  return (
    <div className="voice-recorder p-3 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Voice Message</h3>
        <button 
          onClick={onCancel}
          className="text-gray-400 hover:text-white text-sm"
        >
          ✕
        </button>
      </div>
      
      <div className="flex flex-col items-center mt-2 space-y-3">
        {!audioURL ? (
          <>
            <div className="text-center">
              {isRecording ? (
                <div className="text-red-500 font-medium">Recording... {formatTime(recordingTime)}</div>
              ) : (
                <div className="text-gray-300">Press to start recording</div>
              )}
            </div>
            
            <div className="flex space-x-3">
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center"
                  title="Stop recording"
                >
                  <span className="w-4 h-4 bg-white rounded"></span>
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center"
                  title="Start recording"
                >
                  <span className="w-3 h-6 bg-white rounded-sm"></span>
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <audio src={audioURL} controls className="w-full" />
            
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setAudioURL(null);
                  audioChunksRef.current = [];
                }}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white"
              >
                Discard
              </button>
              <button
                onClick={handleSend}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white"
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VoiceRecorder;
