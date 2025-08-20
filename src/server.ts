import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { extname, join } from "https://deno.land/std@0.224.0/path/mod.ts";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Get the directory of the current script
const __dirname = new URL(".", import.meta.url).pathname;

// Define base paths for our asset directories
const publicPath = join(__dirname, "..", "public");
const srcPath = join(__dirname, ".");
const debugPath = join(__dirname, "..", "debug");


const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  let path = url.pathname;

  // Serve index.html for root path
  if (path === "/") {
    path = "/index.html";
  }

  let fileSystemPath: string;

  // Route requests to the correct directory
  if (path.startsWith("/src/")) {
    // A request for /src/main.js should map to the src directory
    fileSystemPath = join(srcPath, path.substring(5)); // remove '/src/'
  } else if (path.startsWith("/debug/")) {
    // A request for /debug/test.html should map to the debug directory
    fileSystemPath = join(debugPath, path.substring(7)); // remove '/debug/'
  } else {
    // All other requests map to the public directory
    fileSystemPath = join(publicPath, path);
  }

  try {
    const file = await Deno.readFile(fileSystemPath);
    const ext = extname(fileSystemPath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    return new Response(file, {
      headers: {
        "content-type": contentType,
        "cache-control": "no-cache", // Disable caching for development
      },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.error(`File not found: ${fileSystemPath}`);
      return new Response("404 Not Found", { status: 404 });
    }
    console.error(`Error serving ${path}:`, error.message);
    return new Response("500 Internal Server Error", { status: 500 });
  }
};

console.log("Server running on http://localhost:8000");
serve(handler, { port: 8000 });