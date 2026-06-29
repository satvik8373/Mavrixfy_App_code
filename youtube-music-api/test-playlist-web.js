import { Innertube } from 'youtubei.js';
import fs from 'fs';

async function test() {
  try {
    const yt = await Innertube.create();
    console.log("Innertube created");
    
    const playlistId = "VLRDCLAK5uy_n9F5Zg5wq9YV95ypcKdc1-1Gxh9Gg7FNg";
    
    const response = await yt.actions.execute('/browse', {
      browseId: playlistId
    });
    
    console.log("Raw response keys:", Object.keys(response || {}));
    if (response.data) {
      console.log("Response data keys:", Object.keys(response.data));
      if (response.data.contents) {
        console.log("Response has contents!");
      }
    }
    fs.writeFileSync("raw_playlist_web_response.json", JSON.stringify(response, null, 2));
    console.log("Wrote raw_playlist_web_response.json successfully.");
  } catch (err) {
    console.error(err);
  }
}

test();
