import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  // Serve static files
  if (path === "/") {
    try {
      const html = await Deno.readTextFile("./index.html");
      return new Response(html, {
        headers: { "content-type": "text/html" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/main.js") {
    try {
      const js = await Deno.readTextFile("./main.js");
      return new Response(js, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/cv-processor.js") {
    try {
      const js = await Deno.readTextFile("./cv-processor.js");
      return new Response(js, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/sequencer.js") {
    try {
      const js = await Deno.readTextFile("./sequencer.js");
      return new Response(js, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/AudioWorkletService.js") {
    try {
      const js = await Deno.readTextFile("./AudioWorkletService.js");
      return new Response(js, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/constants.js") {
    try {
      const js = await Deno.readTextFile("./constants.js");
      return new Response(js, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/StateManager.js") {
    try {
      const js = await Deno.readTextFile("./StateManager.js");
      return new Response(js, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/UISubscriptions.js") {
    try {
      const js = await Deno.readTextFile("./UISubscriptions.js");
      return new Response(js, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/PatternMigration.js") {
    try {
      const js = await Deno.readTextFile("./PatternMigration.js");
      return new Response(js, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/UIComponentFactory.js") {
    try {
      const js = await Deno.readTextFile("./UIComponentFactory.js");
      return new Response(js, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/ChannelClasses.js") {
    try {
      const js = await Deno.readTextFile("./ChannelClasses.js");
      return new Response(js, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/sequencer-processor.js") {
    try {
      const js = await Deno.readTextFile("./sequencer-processor.js");
      return new Response(js, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/sequencer-worklet.html") {
    try {
      const html = await Deno.readTextFile("./sequencer-worklet.html");
      return new Response(html, {
        headers: { "content-type": "text/html" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/sequencer-worklet.js") {
    try {
      const js = await Deno.readTextFile("./sequencer-worklet.js");
      return new Response(js, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  if (path === "/clock-processor.js") {
    try {
      const js = await Deno.readTextFile("./clock-processor.js");
      return new Response(js, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  }

  return new Response("404 Not Found", { status: 404 });
};

console.log("Server running on http://localhost:8000");
serve(handler, { port: 8000 });
