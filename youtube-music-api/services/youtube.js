import { Innertube, Platform } from "youtubei.js";

let youtubePromise = null;
let evaluatorInstalled = false;

function installJavascriptEvaluator() {
  if (evaluatorInstalled) return;

  Platform.shim.eval = async (data, env) => {
    const evaluatePlayerScript = new Function("env", data.output);
    return evaluatePlayerScript(env);
  };

  evaluatorInstalled = true;
}

export async function getYoutube() {
  if (!youtubePromise) {
    installJavascriptEvaluator();

    youtubePromise = Innertube.create({
      lang: process.env.YOUTUBE_MUSIC_LANGUAGE || "en",
      location: process.env.YOUTUBE_MUSIC_LOCATION || "IN",
      retrieve_player: true,
      cookie: process.env.YOUTUBE_COOKIE || undefined,
      visitor_data: process.env.YOUTUBE_VISITOR_DATA || undefined,
      po_token: process.env.YOUTUBE_PO_TOKEN || undefined,
    });
  }

  return youtubePromise;
}
