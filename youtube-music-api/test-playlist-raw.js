import { Innertube } from 'youtubei.js';
import fs from 'fs';

async function test() {
  try {
    const yt = await Innertube.create({
      gl: "IN",
      hl: "en",
      location: "IN",
      lang: "en"
    });
    console.log("Innertube created with IN region");
    
    const playlistId = "RDCLAK5uy_n9F5Zg5wq9YV95ypcKdc1-1Gxh9Gg7FNg"; // No VL prefix!
    
    const response = await yt.actions.execute('/browse', {
      browseId: playlistId,
      client: "YTMUSIC"
    });
    
    console.log("Raw response keys:", Object.keys(response || {}));
    if (response.data) {
      console.log("Response data keys:", Object.keys(response.data));
    }
    fs.writeFileSync("raw_playlist_response.json", JSON.stringify(response, null, 2));
    console.log("Wrote raw_playlist_response.json successfully.");
  } catch (err) {
    console.error(err);
  }
}

test();
