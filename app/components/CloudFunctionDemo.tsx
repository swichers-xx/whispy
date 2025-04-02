'use client';

import { useState, useEffect } from 'react';

interface CloudFunctionResponse {
  message: string;
  timestamp: string;
  query: Record<string, string>;
}

export default function CloudFunctionDemo() {
  const [response, setResponse] = useState<CloudFunctionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const callCloudFunction = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use the local emulator URL when in development mode
      const functionUrl = 'http://localhost:5001/whispy-app-123/us-central1/helloWorld';
      
      const res = await fetch(`${functionUrl}?name=WhispyUser`);
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      console.error('Error calling cloud function:', err);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4">Google Cloud Function Demo (Local Emulator)</h2>
      
      <button
        onClick={callCloudFunction}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Loading...' : 'Call Cloud Function'}
      </button>
      
      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
          Error: {error}
        </div>
      )}
      
      {response && (
        <div className="mt-4 p-3 bg-green-100 rounded">
          <h3 className="font-semibold">Response:</h3>
          <p className="mt-1"><strong>Message:</strong> {response.message}</p>
          <p className="mt-1"><strong>Timestamp:</strong> {response.timestamp}</p>
          <p className="mt-1"><strong>Query Parameters:</strong></p>
          <pre className="mt-1 p-2 bg-gray-100 rounded text-sm">
            {JSON.stringify(response.query, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
