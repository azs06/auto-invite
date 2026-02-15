import type { Env } from "./types";
import { jsonResponse, htmlResponse, proxyToDurableObject } from "./utils";
import { handleCreateRequest, handleSubmitAvailability } from "./handlers";
import { renderNewPage } from "./pages/new";
import { renderNewGroupPage } from "./pages/new-group";
import { renderRequestPage } from "./pages/request";
import { renderGroupBookingPage } from "./pages/group-booking";

export { AvailabilityRequest } from "./durable-object";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/" || pathname === "") {
      return Response.redirect(`${url.origin}/new`, 302);
    }

    if (pathname === "/new" && request.method === "GET") {
      return htmlResponse(renderNewPage());
    }

    if (pathname === "/new/group" && request.method === "GET") {
      return htmlResponse(renderNewGroupPage());
    }

    if (pathname.startsWith("/r/") && request.method === "GET") {
      return htmlResponse(renderRequestPage());
    }

    if (pathname.startsWith("/g/") && request.method === "GET") {
      return htmlResponse(renderGroupBookingPage());
    }

    if (pathname === "/api/request" && request.method === "POST") {
      return handleCreateRequest(request, env, url.origin);
    }

    if (pathname.startsWith("/api/request/")) {
      const parts = pathname.split("/").filter(Boolean);
      const requestId = parts[2];
      const extra = parts[3] ?? "";

      if (!requestId) {
        return jsonResponse({ error: "Missing request id." }, 400);
      }

      const stub = env.AVAILABILITY.get(env.AVAILABILITY.idFromName(requestId));

      if (!extra && request.method === "GET") {
        return proxyToDurableObject(stub, `/request${url.search}`, request);
      }

      if (!extra && request.method === "PUT") {
        return proxyToDurableObject(stub, `/request${url.search}`, request);
      }

      if (!extra && request.method === "DELETE") {
        return proxyToDurableObject(stub, `/request${url.search}`, request);
      }

      if (extra === "availability" && request.method === "GET") {
        return proxyToDurableObject(stub, `/submission${url.search}`, request);
      }

      if (extra === "export.ics" && request.method === "GET") {
        return proxyToDurableObject(stub, `/export.ics${url.search}`, request);
      }

      if (extra === "confirm" && request.method === "POST") {
        return proxyToDurableObject(stub, `/confirm${url.search}`, request);
      }

      if (extra === "submit" && request.method === "POST") {
        return handleSubmitAvailability(request, stub);
      }

      if (extra === "slots" && request.method === "GET") {
        return proxyToDurableObject(stub, `/slots${url.search}`, request);
      }

      if (extra === "book" && request.method === "POST") {
        return proxyToDurableObject(stub, `/book${url.search}`, request);
      }

      if (extra === "book" && request.method === "DELETE") {
        return proxyToDurableObject(stub, `/book${url.search}`, request);
      }

      if (extra === "bookings" && request.method === "GET") {
        return proxyToDurableObject(stub, `/bookings${url.search}`, request);
      }
    }

    // WebSocket upgrade for real-time admin notifications
    if (pathname.startsWith("/ws/") && request.method === "GET") {
      const parts = pathname.split("/").filter(Boolean);
      const requestId = parts[1];
      if (!requestId) {
        return jsonResponse({ error: "Missing request id." }, 400);
      }
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }
      const stub = env.AVAILABILITY.get(env.AVAILABILITY.idFromName(requestId));
      return proxyToDurableObject(stub, `/ws${url.search}`, request);
    }

    return jsonResponse({ error: "Not found." }, 404);
  },
};
