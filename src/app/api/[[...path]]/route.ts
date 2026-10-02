import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  ApiFailure, authenticate, cancelRide, changeTripStatus, createRide, createSession, findUserById,
  getBootstrap, publicUser, rateTrip, readNotification, readSession, registerAccount,
  respondMatch, sessionCookie, updateRide, updateTripLocation, updateUser,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginAttempts = new Map<string, number[]>();
const MAX_BODY = 64 * 1024;

function jsonError(error: unknown) {
  if (error instanceof ApiFailure) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("CampusRide API error:", error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

async function readBody(request: NextRequest) {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > MAX_BODY) throw new ApiFailure(413, "Request is too large.");
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid body");
    return body as Record<string, any>;
  } catch { throw new ApiFailure(400, "Send a valid JSON object."); }
}

function attachSession<T>(response: NextResponse<T>, userId: number) {
  response.cookies.set(sessionCookie.name, createSession(userId), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: sessionCookie.ttl,
  });
  return response;
}

async function signedInUser() {
  const store = await cookies();
  const userId = readSession(store.get(sessionCookie.name)?.value);
  const user = userId ? findUserById(userId) : undefined;
  if (!user) throw new ApiFailure(401, "Please sign in to continue.");
  return user;
}

async function handle(request: NextRequest) {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
    const method = request.method;

    if (method === "POST" && path.join("/") === "auth/login") {
      const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
      const now = Date.now();
      const recent = (loginAttempts.get(address) || []).filter(stamp => now - stamp < 300_000);
      if (recent.length >= 12) throw new ApiFailure(429, "Too many sign-in attempts. Try again in a few minutes.");
      recent.push(now); loginAttempts.set(address, recent);
      const body = await readBody(request);
      const user = authenticate(String(body.email ?? ""), String(body.password ?? ""));
      return attachSession(NextResponse.json({ user: publicUser(user) }), user.id);
    }

    if (method === "POST" && path.join("/") === "auth/register") {
      const user = registerAccount(await readBody(request));
      return attachSession(NextResponse.json({ user: publicUser(user) }, { status: 201 }), user.id);
    }

    if (method === "POST" && path.join("/") === "auth/logout") {
      const response = NextResponse.json({ ok: true });
      response.cookies.set(sessionCookie.name, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
      return response;
    }

    const user = await signedInUser();
    if (method === "GET" && path.join("/") === "me") return NextResponse.json({ user: publicUser(user) });
    if (method === "GET" && path.join("/") === "bootstrap") return NextResponse.json(getBootstrap(user));

    if (method === "POST" && path.join("/") === "rides") {
      const rideId = createRide(user, await readBody(request));
      return NextResponse.json({ ok: true, ride_id: rideId }, { status: 201 });
    }
    if (method === "PATCH" && path.length === 2 && path[0] === "rides") {
      updateRide(user, Number(path[1]), await readBody(request)); return NextResponse.json({ ok: true });
    }
    if (method === "POST" && path.length === 3 && path[0] === "rides" && path[2] === "cancel") {
      cancelRide(user, Number(path[1])); return NextResponse.json({ ok: true });
    }
    if (method === "POST" && path.length === 3 && path[0] === "matches" && path[2] === "respond") {
      const body = await readBody(request);
      return NextResponse.json(respondMatch(user, Number(path[1]), String(body.action ?? "")));
    }
    if (method === "POST" && path.length === 3 && path[0] === "trips" && path[2] === "status") {
      const body = await readBody(request);
      return NextResponse.json(changeTripStatus(user, Number(path[1]), String(body.status ?? "")));
    }
    if (method === "POST" && path.length === 3 && path[0] === "trips" && path[2] === "location") {
      updateTripLocation(user, Number(path[1]), await readBody(request)); return NextResponse.json({ ok: true, updated_at: new Date().toISOString() });
    }
    if (method === "POST" && path.length === 3 && path[0] === "trips" && path[2] === "rating") {
      rateTrip(user, Number(path[1]), await readBody(request)); return NextResponse.json({ ok: true }, { status: 201 });
    }
    if (method === "POST" && path.length === 3 && path[0] === "notifications" && path[2] === "read") {
      readNotification(user, Number(path[1])); return NextResponse.json({ ok: true });
    }
    if (method === "PATCH" && path.length === 3 && path[0] === "admin" && path[1] === "users") {
      updateUser(user, Number(path[2]), await readBody(request)); return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "That action was not found." }, { status: 404 });
  } catch (error) { return jsonError(error); }
}

export async function GET(request: NextRequest) { return handle(request); }
export async function POST(request: NextRequest) { return handle(request); }
export async function PATCH(request: NextRequest) { return handle(request); }
