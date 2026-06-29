import { Innertube } from 'youtubei.js';
import util from 'util';

async function test() {
  try {
    const yt = await Innertube.create({
      gl: "IN",
      hl: "en",
      location: "IN",
      lang: "en"
    });
    
    const id = "VLRDCLAK5uy_n9F5Zg5wq9YV95ypcKdc1-1Gxh9Gg7FNg";
    console.log(`\n=== Fetching ${id} ===`);
    const playlist = await yt.music.getPlaylist(id);
    
    console.log(util.inspect(playlist, { showHidden: false, depth: 3, colors: false }));
  } catch (err) {
    console.error(err);
  }
}

test();
