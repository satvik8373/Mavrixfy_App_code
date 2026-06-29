import { Innertube, Platform, UniversalCache } from "youtubei.js";
import vm from "node:vm";

let youtubePromise = null;
let evaluatorInstalled = false;

function installJavascriptEvaluator() {
  if (evaluatorInstalled) return;

  Platform.shim.eval = async (data, env) => {
    const script = new vm.Script(`(function(env){ ${data.output} })`);
    const fn = script.runInNewContext({});
    return fn(env);
  };

  evaluatorInstalled = true;
}

export async function getYoutube() {
  if (!youtubePromise) {
    installJavascriptEvaluator();

    youtubePromise = Innertube.create({
      gl: process.env.YOUTUBE_MUSIC_LOCATION || "IN",
      hl: process.env.YOUTUBE_MUSIC_LANGUAGE || "en",
      lang: process.env.YOUTUBE_MUSIC_LANGUAGE || "en",
      location: process.env.YOUTUBE_MUSIC_LOCATION || "IN",
      retrieve_player: true,
      cookie: process.env.YOUTUBE_COOKIE || undefined,
      po_token: process.env.YOUTUBE_PO_TOKEN || undefined,
      cache: new UniversalCache(false),
    });
  }

  return youtubePromise;
}
