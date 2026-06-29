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
    
    const playlistId = "VLRDCLAK5uy_n9F5Zg5wq9YV95ypcKdc1-1Gxh9Gg7FNg";
    const p1 = await yt.music.getPlaylist(playlistId);
    
    console.log("p1.page.contents_memo exists?", !!p1.page?.contents_memo);
    if (p1.page?.contents_memo) {
      const types = Array.from(p1.page.contents_memo.keys());
      console.log("All component types in contents_memo:", types);
      for (const type of types) {
        const instances = p1.page.contents_memo.getType(type);
        console.log(`  Type "${type.name || type}": ${instances.length} instances`);
      }
    } else {
      console.log("p1.page keys:", Object.keys(p1.page || {}));
    }
  } catch (err) {
    console.error(err);
  }
}

test();
