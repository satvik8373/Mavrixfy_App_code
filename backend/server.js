import cors from "cors";
import express from "express";
import musicRouter from "./routes/music.js";

const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "Mavrixfy YouTube Music API",
    provider: "youtubei.js",
  });
});

app.use("/", musicRouter);
app.use("/api", musicRouter);
app.use("/api/youtube-music", musicRouter);

app.use((err, _req, res, _next) => {
  const status = Number(err?.status || err?.statusCode) || 500;
  const message = err?.message || "Internal server error";
  if (status >= 500) {
    console.error("[youtubei-api]", err);
  }
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT || 8000);
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Mavrixfy YouTube Music API listening on http://localhost:${port}`);
  });
}

export default app;
