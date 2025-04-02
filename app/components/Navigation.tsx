'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();
  
  const isActive = (path: string) => pathname === path;
  
  return (
    <nav className="bg-gray-800 text-white p-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center">
          <Link href="/" className="text-xl font-bold">
            Whispy
          </Link>
        </div>
        
        <div className="flex space-x-4">
          <Link 
            href="/" 
            className={`px-3 py-2 rounded-md text-sm font-medium ${
              isActive('/') 
                ? 'bg-gray-900 text-white' 
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            Home
          </Link>
          
          <Link 
            href="/cloud-functions" 
            className={`px-3 py-2 rounded-md text-sm font-medium ${
              isActive('/cloud-functions') 
                ? 'bg-gray-900 text-white' 
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            Cloud Functions
          </Link>
        </div>
      </div>
    </nav>
  );
}
