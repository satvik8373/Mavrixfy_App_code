import { Innertube } from 'youtubei.js';

async function test() {
  try {
    const yt = await Innertube.create({
      gl: "IN",
      hl: "en",
      location: "IN",
      lang: "en"
    });
    console.log("Innertube created");

    const query = "Bollywood Hotlist";
    const search = await yt.music.search(query, { type: "playlist" });
    const playlists = search.playlists?.contents || [];
    console.log(`Found ${playlists.length} playlists for "${query}":`);

    for (const p of playlists) {
      console.log(`- Title: "${p.title}", ID: "${p.id}", Author: "${p.author?.name}"`);
      try {
        const details = await yt.music.getPlaylist(p.id);
        console.log(`  getPlaylist success, track count: ${details.contents?.length || details.items?.length || 0}`);
      } catch (err) {
        console.error(`  getPlaylist failed:`, err.message);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

test();
