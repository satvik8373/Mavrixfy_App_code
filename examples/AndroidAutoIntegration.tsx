import React, { useEffect } from 'react';
import { useAndroidAuto } from '../hooks/useAndroidAuto';

// Example: How to integrate Android Auto in your app

export const AndroidAutoIntegration = () => {
  const { syncMusicData } = useAndroidAuto();

  useEffect(() => {
    // Sync your music data when the app loads or when data changes
    const loadMusicData = async () => {
      // Example: Fetch from your API
      const trending = [
        {
          id: '1',
          title: 'Song Title 1',
          artist: 'Artist Name',
          album: 'Album Name',
          url: 'https://example.com/song1.mp3'
        },
        // ... more songs
      ];

      const playlists = [
        {
          id: 'p1',
          title: 'My Playlist',
          subtitle: '20 songs'
        },
        // ... more playlists
      ];

      const albums = [
        {
          id: 'a1',
          title: 'Album Title',
          artist: 'Artist Name'
        },
        // ... more albums
      ];

      await syncMusicData({ trending, playlists, albums });
    };

    loadMusicData();
  }, []);

  return null; // This is a logic-only component
};

// Usage in your main App component:
// import { AndroidAutoIntegration } from './examples/AndroidAutoIntegration';
// 
// function App() {
//   return (
//     <>
//       <AndroidAutoIntegration />
//       {/* Your other components */}
//     </>
//   );
// }
