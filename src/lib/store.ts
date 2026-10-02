import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Row = Record<string, any>;
export type CampusUser = Row & {
  id: number; name: string; email: string; campus_id: string; role: "student" | "staff";
  phone: string; verification_status: "pending" | "verified" | "rejected";
  is_admin: number; active: number; password_hash: string;
};

export class ApiFailure extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const ROOT = process.cwd();
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DEFAULT_DATA_DIR = IS_SERVERLESS ? "/tmp" : path.join(ROOT, ".data");
const DB_FILE = process.env.CAMPUS_RIDES_DB || path.join(DEFAULT_DATA_DIR, "campusride.sqlite");
const DATA_DIR = path.dirname(DB_FILE);
const SECRET_FILE = path.join(DATA_DIR, "session.secret");
const COOKIE_NAME = "campus_session";
const TOKEN_TTL = 60 * 60 * 24 * 7;
const LANDMARKS = [
  "Main Gate", "Town Campus", "Annex Campus", "University Library", "Student Hostels",
  "Staff Quarters", "Itam Market", "Shelter Afrique", "Four Lanes", "Ibom Plaza", "Other campus location",
];

const globalDb = globalThis as typeof globalThis & { __campusRideDb?: DatabaseSync; __campusRideSecret?: Buffer };

function sessionSecret() {
  if (process.env.CAMPUS_RIDES_SECRET) return Buffer.from(process.env.CAMPUS_RIDES_SECRET);
  if (globalDb.__campusRideSecret) return globalDb.__campusRideSecret;
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(SECRET_FILE)) {
    try { writeFileSync(SECRET_FILE, randomBytes(48), { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  try { chmodSync(SECRET_FILE, 0o600); } catch { /* Existing secret remains usable on restricted filesystems. */ }
  globalDb.__campusRideSecret = readFileSync(SECRET_FILE);
  return globalDb.__campusRideSecret;
}

function utcNow() { return new Date().toISOString(); }
function asNumber(value: unknown) { return typeof value === "bigint" ? Number(value) : Number(value); }
function b64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

export function createSession(userId: number) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL }));
  const signature = createHmac("sha256", sessionSecret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function readSession(token?: string) {
  if (!token) return null;
  try {
    const [header, body, signature] = token.split(".");
    const expected = createHmac("sha256", sessionSecret()).update(`${header}.${body}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!Number.isInteger(claims.sub) || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims.sub as number;
  } catch { return null; }
}

function hashPassword(password: string, salt = randomBytes(16)) {
  const derived = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

function passwordMatches(password: string, stored: string) {
  try {
    const [saltText, digestText] = stored.split("$");
    const expected = Buffer.from(digestText, "base64url");
    const actual = scryptSync(password, Buffer.from(saltText, "base64url"), expected.length, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

function notify(con: DatabaseSync, userId: number, title: string, message: string, kind = "info", resourceType: string | null = null, resourceId: number | null = null) {
  con.prepare("INSERT INTO notifications(user_id,title,message,kind,resource_type,resource_id,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(userId, title, message, kind, resourceType, resourceId, utcNow());
}

function seedDemo(con: DatabaseSync) {
  const created = utcNow();
  const accounts = [
    ["Amara Nwosu", "amara@student.uniuyo.edu.ng", "21/SC/CO/1001", "student", "+234 803 000 0101", 0],
    ["Tunde Ekanem", "tunde.driver@student.uniuyo.edu.ng", "21/SC/CO/1002", "student", "+234 803 000 0102", 0],
    ["Admin Support", "admin@campus.local", "ADMIN-UNIYO-01", "staff", "+234 800 000 0000", 1],
  ] as const;
  const ids = new Map<string, number>();
  const insertUser = con.prepare("INSERT INTO users(name,email,campus_id,role,phone,password_hash,verification_status,is_admin,created_at) VALUES(?,?,?,?,?,?,'verified',?,?)");
  for (const [name, email, campusId, role, phone, admin] of accounts) {
    const result = insertUser.run(name, email, campusId, role, phone, hashPassword("CampusRide!23"), admin, created);
    ids.set(email, asNumber(result.lastInsertRowid));
  }
  const request = con.prepare("INSERT INTO rides(owner_id,kind,origin,destination,depart_at,seats,notes,created_at) VALUES(?,?,?,?,?,?,?,?)");
  const requestId = asNumber(request.run(ids.get("amara@student.uniuyo.edu.ng")!, "request", "Main Gate", "Shelter Afrique", new Date(Date.now() + 50 * 60000).toISOString(), 1, "Heading out after my afternoon class.", created).lastInsertRowid);
  const offerId = asNumber(request.run(ids.get("tunde.driver@student.uniuyo.edu.ng")!, "offer", "Main Gate", "Shelter Afrique", new Date(Date.now() + 55 * 60000).toISOString(), 3, "Three seats available. Meet by the main gate taxi rank.", created).lastInsertRowid);
  const matchId = asNumber(con.prepare("INSERT INTO matches(request_id,offer_id,score,status,created_at) VALUES(?,?,96,'proposed',?)").run(requestId, offerId, created).lastInsertRowid);
  notify(con, ids.get("amara@student.uniuyo.edu.ng")!, "A ride may fit your plans", "Tunde is heading from Main Gate to Shelter Afrique around your requested time.", "match", "match", matchId);
  notify(con, ids.get("tunde.driver@student.uniuyo.edu.ng")!, "A passenger may fit your route", "Amara is looking for a ride from Main Gate to Shelter Afrique around your departure time.", "match", "match", matchId);
}

export function database() {
  if (globalDb.__campusRideDb) return globalDb.__campusRideDb;
  mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const con = new DatabaseSync(DB_FILE);
  con.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
  con.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      campus_id TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL CHECK(role IN ('student','staff')),
      phone TEXT NOT NULL, password_hash TEXT NOT NULL, verification_status TEXT NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','verified','rejected')),
      is_admin INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rides (
      id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('offer','request')),
      origin TEXT NOT NULL, destination TEXT NOT NULL, depart_at TEXT NOT NULL, seats INTEGER NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','matched','cancelled')), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES rides(id), offer_id INTEGER NOT NULL REFERENCES rides(id),
      score INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','accepted','rejected')),
      passenger_accepted INTEGER NOT NULL DEFAULT 0, driver_accepted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, UNIQUE(request_id,offer_id)
    );
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY, match_id INTEGER NOT NULL UNIQUE REFERENCES matches(id),
      status TEXT NOT NULL DEFAULT 'accepted' CHECK(status IN ('accepted','in_progress','completed','cancelled')),
      created_at TEXT NOT NULL, started_at TEXT, ended_at TEXT, latitude REAL, longitude REAL, location_updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, message TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'info', resource_type TEXT, resource_id INTEGER, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY, trip_id INTEGER NOT NULL REFERENCES trips(id), rater_id INTEGER NOT NULL REFERENCES users(id),
      rated_user_id INTEGER NOT NULL REFERENCES users(id), score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
      comment TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, UNIQUE(trip_id,rater_id)
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL, resource TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rides_status_time ON rides(status,depart_at);
    CREATE INDEX IF NOT EXISTS idx_rides_owner ON rides(owner_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,is_read,created_at DESC);
  `);
  if (Number(con.prepare("SELECT COUNT(*) AS n FROM users").get()?.n) === 0) seedDemo(con);
  globalDb.__campusRideDb = con;
  return con;
}

export function publicUser(user?: Row | null) {
  if (!user) return null;
  const { password_hash: _password, ...data } = user;
  return { ...data, is_admin: Boolean(data.is_admin), active: Boolean(data.active) };
}

export function findUserById(id: number) { return database().prepare("SELECT * FROM users WHERE id=? AND active=1").get(id) as CampusUser | undefined; }

export function authenticate(emailValue: string, password: string) {
  const email = emailValue.trim().toLowerCase();
  const user = database().prepare("SELECT * FROM users WHERE email=?").get(email) as CampusUser | undefined;
  if (!user || !user.active || !passwordMatches(password, user.password_hash)) throw new ApiFailure(401, "The email or password is incorrect.");
  return user;
}

export function registerAccount(input: Row) {
  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const campusId = String(input.campus_id ?? "").trim();
  const role = String(input.role ?? "student");
  const phone = String(input.phone ?? "").trim();
  const password = String(input.password ?? "");
  if (name.length < 2 || name.length > 80) throw new ApiFailure(400, "Enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw new ApiFailure(400, "Enter a valid email address.");
  if (!campusId || campusId.length > 40 || phone.length < 7 || phone.length > 30) throw new ApiFailure(400, "Enter your campus ID and phone number.");
  if (role !== "student" && role !== "staff") throw new ApiFailure(400, "Choose student or staff.");
  if (password.length < 10) throw new ApiFailure(400, "Choose a password with at least 10 characters.");
  try {
    const result = database().prepare("INSERT INTO users(name,email,campus_id,role,phone,password_hash,verification_status,created_at) VALUES(?,?,?,?,?,?,'pending',?)")
      .run(name, email, campusId, role, phone, hashPassword(password), utcNow());
    return findUserById(asNumber(result.lastInsertRowid))!;
  } catch (error) {
    const text = String(error);
    if (text.toLowerCase().includes("email")) throw new ApiFailure(409, "An account with this email already exists.");
    if (text.toLowerCase().includes("campus_id")) throw new ApiFailure(409, "That campus ID is already registered.");
    throw error;
  }
}

function requireVerified(user: CampusUser) {
  if (user.verification_status !== "verified") throw new ApiFailure(403, "Your campus identity is awaiting administrator verification.");
}
function requireAdmin(user: CampusUser) { if (!user.is_admin) throw new ApiFailure(403, "Administrator access is required."); }
function normalizePlace(place: string) { return place.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function similarity(a: string, b: string) {
  if (a === b) return 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = prev[j]; prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)); diagonal = old;
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length, 1);
}

function computeScore(request: Row, offer: Row) {
  const origin = similarity(normalizePlace(request.origin), normalizePlace(offer.origin));
  const destination = similarity(normalizePlace(request.destination), normalizePlace(offer.destination));
  const delta = Math.abs(Date.parse(request.depart_at) - Date.parse(offer.depart_at)) / 60000;
  if (origin < 0.48 || destination < 0.48 || offer.seats < 1 || delta > 90) return 0;
  return Math.round((origin * 0.38 + destination * 0.42 + Math.max(0, 1 - delta / 120) * 0.2) * 100);
}

function pairCandidates(con: DatabaseSync, rideId: number) {
  const ride = con.prepare("SELECT r.*,u.name AS owner_name FROM rides r JOIN users u ON u.id=r.owner_id WHERE r.id=?").get(rideId) as Row | undefined;
  if (!ride || ride.status !== "open") return;
  const candidateKind = ride.kind === "offer" ? "request" : "offer";
  const candidates = con.prepare("SELECT r.*,u.name AS owner_name FROM rides r JOIN users u ON u.id=r.owner_id WHERE r.kind=? AND r.status='open' AND r.owner_id<>? AND u.verification_status='verified' AND u.active=1")
    .all(candidateKind, ride.owner_id) as Row[];
  for (const candidate of candidates) {
    const request = ride.kind === "offer" ? candidate : ride;
    const offer = ride.kind === "offer" ? ride : candidate;
    const score = computeScore(request, offer);
    if (score < 62) continue;
    const existing = con.prepare("SELECT id,status FROM matches WHERE request_id=? AND offer_id=?").get(request.id,offer.id) as Row | undefined;
    let created = false;
    let matchId = 0;
    if (!existing) {
      const result = con.prepare("INSERT INTO matches(request_id,offer_id,score,status,created_at) VALUES(?,?,?,'proposed',?)").run(request.id,offer.id,score,utcNow());
      matchId = asNumber(result.lastInsertRowid); created = true;
    } else if (existing.status === "rejected") {
      con.prepare("UPDATE matches SET score=?,status='proposed',passenger_accepted=0,driver_accepted=0,created_at=? WHERE id=?").run(score,utcNow(),existing.id);
      matchId = Number(existing.id); created = true;
    } else if (existing.status === "proposed") {
      con.prepare("UPDATE matches SET score=? WHERE id=?").run(score,existing.id);
      matchId = Number(existing.id);
    }
    if (created) {
      notify(con, request.owner_id, "A ride may fit your plans", `${offer.owner_name} has a route that may match. Review it in Suggested matches.`, "match", "match", matchId);
      notify(con, offer.owner_id, "A passenger may fit your route", "A campus rider has a request near your route and departure time.", "match", "match", matchId);
    }
  }
}

function getRideRows(where: string, ...values: SQLInputValue[]) {
  return database().prepare(`SELECT r.*,u.name AS owner_name,u.role AS owner_role,u.verification_status AS owner_verified,COALESCE((SELECT ROUND(AVG(score),1) FROM ratings WHERE rated_user_id=u.id),0) AS owner_rating FROM rides r JOIN users u ON u.id=r.owner_id ${where}`).all(...values) as Row[];
}

export function getBootstrap(me: CampusUser) {
  const con = database(); const id = me.id;
  const myRides = getRideRows("WHERE r.owner_id=? ORDER BY r.created_at DESC", id);
  const matches = con.prepare(`SELECT m.*,req.owner_id AS passenger_id,req.origin AS request_origin,req.destination AS request_destination,req.depart_at AS request_depart_at,req.seats AS request_seats,passenger.name AS passenger_name,off.owner_id AS driver_id,off.origin AS offer_origin,off.destination AS offer_destination,off.depart_at AS offer_depart_at,off.seats AS offer_seats,off.notes AS offer_notes,driver.name AS driver_name,CASE WHEN req.owner_id=? THEN 1 ELSE 0 END AS is_passenger FROM matches m JOIN rides req ON req.id=m.request_id JOIN rides off ON off.id=m.offer_id JOIN users passenger ON passenger.id=req.owner_id JOIN users driver ON driver.id=off.owner_id WHERE req.owner_id=? OR off.owner_id=? ORDER BY m.created_at DESC`).all(id,id,id) as Row[];
  const trips = con.prepare(`SELECT t.*,m.id AS match_id,m.passenger_accepted,m.driver_accepted,req.owner_id AS passenger_id,req.origin,req.destination,req.depart_at,req.notes AS request_notes,passenger.name AS passenger_name,off.owner_id AS driver_id,off.seats,off.notes AS offer_notes,driver.name AS driver_name,EXISTS(SELECT 1 FROM ratings WHERE trip_id=t.id AND rater_id=?) AS my_rating_submitted FROM trips t JOIN matches m ON m.id=t.match_id JOIN rides req ON req.id=m.request_id JOIN rides off ON off.id=m.offer_id JOIN users passenger ON passenger.id=req.owner_id JOIN users driver ON driver.id=off.owner_id WHERE req.owner_id=? OR off.owner_id=? ORDER BY t.created_at DESC`).all(id,id,id) as Row[];
  const notifications = con.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 20").all(id) as Row[];
  const metrics = {
    active_rides: Number(con.prepare("SELECT COUNT(*) AS n FROM rides WHERE owner_id=? AND status='open'").get(id)?.n),
    pending_matches: Number(con.prepare("SELECT COUNT(*) AS n FROM matches m JOIN rides r ON r.id=m.request_id JOIN rides o ON o.id=m.offer_id WHERE m.status='proposed' AND (r.owner_id=? OR o.owner_id=?)").get(id,id)?.n),
    completed_trips: Number(con.prepare("SELECT COUNT(*) AS n FROM trips t JOIN matches m ON m.id=t.match_id JOIN rides r ON r.id=m.request_id JOIN rides o ON o.id=m.offer_id WHERE t.status='completed' AND (r.owner_id=? OR o.owner_id=?)").get(id,id)?.n),
  };
  const result: Row = {
    user: publicUser(me), landmarks: LANDMARKS, my_rides: myRides, matches, trips, notifications,
    unread_count: notifications.filter(item => !item.is_read).length, metrics,
    open_offers: me.verification_status === "verified" ? getRideRows("WHERE r.kind='offer' AND r.status='open' AND r.owner_id<>? AND u.verification_status='verified' AND u.active=1 ORDER BY r.depart_at ASC LIMIT 50", id) : [],
    open_requests: me.verification_status === "verified" ? getRideRows("WHERE r.kind='request' AND r.status='open' AND r.owner_id<>? AND u.verification_status='verified' AND u.active=1 ORDER BY r.depart_at ASC LIMIT 50", id) : [],
  };
  if (me.is_admin) {
    result.admin = {
      users: con.prepare("SELECT * FROM users ORDER BY CASE verification_status WHEN 'pending' THEN 0 ELSE 1 END,created_at DESC").all().map(publicUser),
      counts: {
        users: Number(con.prepare("SELECT COUNT(*) AS n FROM users WHERE is_admin=0").get()?.n),
        pending: Number(con.prepare("SELECT COUNT(*) AS n FROM users WHERE verification_status='pending' AND is_admin=0").get()?.n),
        rides: Number(con.prepare("SELECT COUNT(*) AS n FROM rides WHERE status='open'").get()?.n),
        trips: Number(con.prepare("SELECT COUNT(*) AS n FROM trips").get()?.n),
      },
      recent_rides: getRideRows("ORDER BY r.created_at DESC LIMIT 20"),
      audit: con.prepare("SELECT a.*,u.name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 12").all(),
    };
  }
  return result;
}

export function createRide(user: CampusUser, input: Row) {
  requireVerified(user);
  const kind = String(input.kind ?? "");
  const origin = String(input.origin ?? "").trim();
  const destination = String(input.destination ?? "").trim();
  const notes = String(input.notes ?? "").trim().slice(0, 280);
  const when = new Date(String(input.depart_at ?? ""));
  if (!Number.isFinite(when.getTime())) throw new ApiFailure(400, "Choose a departure date and time.");
  if (!["offer", "request"].includes(kind) || !origin || !destination || origin.length > 100 || destination.length > 100) throw new ApiFailure(400, "Choose a ride type, pickup and destination.");
  if (normalizePlace(origin) === normalizePlace(destination)) throw new ApiFailure(400, "Choose different pickup and destination locations.");
  if (when.getTime() < Date.now() - 2 * 60000 || when.getTime() > Date.now() + 14 * 86400000) throw new ApiFailure(400, "Departure must be within the next 14 days.");
  let seats = 1;
  if (kind === "offer") {
    seats = Number(input.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 8) throw new ApiFailure(400, "Seats must be a number between 1 and 8.");
  }
  const con = database();
  const result = con.prepare("INSERT INTO rides(owner_id,kind,origin,destination,depart_at,seats,notes,created_at) VALUES(?,?,?,?,?,?,?,?)").run(user.id, kind, origin, destination, when.toISOString(), seats, notes, utcNow());
  const id = asNumber(result.lastInsertRowid); pairCandidates(con, id);
  con.prepare("INSERT INTO audit_log(actor_id,action,resource,created_at) VALUES(?,?,?,?)").run(user.id, "created ride", `ride:${id}`, utcNow());
  return id;
}

export function updateRide(user: CampusUser, rideId: number, input: Row) {
  requireVerified(user);
  const con = database();
  const ride = con.prepare("SELECT * FROM rides WHERE id=? AND owner_id=?").get(rideId,user.id) as Row | undefined;
  if (!ride) throw new ApiFailure(404,"Ride not found.");
  if (ride.status !== "open") throw new ApiFailure(409,"Only an open ride can be edited.");
  const origin = String(input.origin ?? "").trim();
  const destination = String(input.destination ?? "").trim();
  const notes = String(input.notes ?? "").trim().slice(0,280);
  const when = new Date(String(input.depart_at ?? ""));
  if (!Number.isFinite(when.getTime())) throw new ApiFailure(400,"Choose a departure date and time.");
  if (!origin || !destination || origin.length > 100 || destination.length > 100) throw new ApiFailure(400,"Choose a pickup and destination.");
  if (normalizePlace(origin) === normalizePlace(destination)) throw new ApiFailure(400,"Choose different pickup and destination locations.");
  if (when.getTime() < Date.now() - 2 * 60000 || when.getTime() > Date.now() + 14 * 86400000) throw new ApiFailure(400,"Departure must be within the next 14 days.");
  let seats = 1;
  if (ride.kind === "offer") {
    seats = Number(input.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 8) throw new ApiFailure(400,"Seats must be a number between 1 and 8.");
  }
  con.prepare("UPDATE rides SET origin=?,destination=?,depart_at=?,seats=?,notes=? WHERE id=?").run(origin,destination,when.toISOString(),seats,notes,rideId);
  con.prepare("UPDATE matches SET status='rejected',passenger_accepted=0,driver_accepted=0 WHERE status='proposed' AND (request_id=? OR offer_id=?)").run(rideId,rideId);
  pairCandidates(con,rideId);
  con.prepare("INSERT INTO audit_log(actor_id,action,resource,created_at) VALUES(?,?,?,?)").run(user.id,"edited ride",`ride:${rideId}`,utcNow());
}

export function cancelRide(user: CampusUser, rideId: number) {
  requireVerified(user);
  const con = database(); const ride = con.prepare("SELECT * FROM rides WHERE id=? AND owner_id=?").get(rideId,user.id) as Row | undefined;
  if (!ride) throw new ApiFailure(404, "Ride not found.");
  if (ride.status !== "open") throw new ApiFailure(409, "Only an open ride can be cancelled.");
  con.prepare("UPDATE rides SET status='cancelled' WHERE id=?").run(rideId);
  con.prepare("UPDATE matches SET status='rejected' WHERE status='proposed' AND (request_id=? OR offer_id=?)").run(rideId,rideId);
}

export function respondMatch(user: CampusUser, matchId: number, action: string) {
  requireVerified(user);
  const con = database();
  const match = con.prepare("SELECT m.*,req.owner_id AS passenger_id,off.owner_id AS driver_id,req.status AS request_status,off.status AS offer_status FROM matches m JOIN rides req ON req.id=m.request_id JOIN rides off ON off.id=m.offer_id WHERE m.id=?").get(matchId) as Row | undefined;
  if (!match || ![match.passenger_id, match.driver_id].includes(user.id)) throw new ApiFailure(404,"Suggested match not found.");
  if (match.status !== "proposed") throw new ApiFailure(409,"This match is no longer open.");
  if (!["accept","decline"].includes(action)) throw new ApiFailure(400,"Choose accept or decline.");
  const passengerSide = user.id === match.passenger_id;
  if (action === "decline") {
    con.prepare("UPDATE matches SET status='rejected' WHERE id=?").run(matchId);
    notify(con, passengerSide ? match.driver_id : match.passenger_id, "Match declined", `${user.name} declined the suggested ride. Your rides are still open to match.`, "info", "match", matchId);
    return { status: "rejected" };
  }
  con.prepare(`UPDATE matches SET ${passengerSide ? "passenger_accepted" : "driver_accepted"}=1 WHERE id=?`).run(matchId);
  const refreshed = con.prepare("SELECT * FROM matches WHERE id=?").get(matchId) as Row;
  if (refreshed.passenger_accepted && refreshed.driver_accepted) {
    if (match.request_status !== "open" || match.offer_status !== "open") {
      con.prepare("UPDATE matches SET status='rejected' WHERE id=?").run(matchId);
      throw new ApiFailure(409,"One of these rides is no longer available.");
    }
    con.exec("BEGIN IMMEDIATE");
    try {
      con.prepare("UPDATE matches SET status='accepted' WHERE id=?").run(matchId);
      const trip = con.prepare("INSERT INTO trips(match_id,status,created_at) VALUES(?,'accepted',?)").run(matchId,utcNow());
      con.prepare("UPDATE rides SET status='matched' WHERE id IN (?,?)").run(match.request_id,match.offer_id);
      for (const participant of [match.passenger_id,match.driver_id]) notify(con,participant,"Ride confirmed","Both people accepted. Your trip details are ready.","trip","trip",asNumber(trip.lastInsertRowid));
      con.exec("COMMIT");
    } catch (error) { con.exec("ROLLBACK"); throw error; }
    return { status: "accepted" };
  }
  notify(con, passengerSide ? match.driver_id : match.passenger_id, "A ride match was accepted", `${user.name} accepted. Review the match to confirm the trip.`, "match", "match", matchId);
  return { status: "proposed" };
}

export function changeTripStatus(user: CampusUser, tripId: number, target: string) {
  requireVerified(user);
  const con = database();
  const trip = con.prepare("SELECT t.*,m.request_id,m.offer_id,req.owner_id AS passenger_id,off.owner_id AS driver_id FROM trips t JOIN matches m ON m.id=t.match_id JOIN rides req ON req.id=m.request_id JOIN rides off ON off.id=m.offer_id WHERE t.id=?").get(tripId) as Row | undefined;
  if (!trip || ![trip.passenger_id,trip.driver_id].includes(user.id)) throw new ApiFailure(404,"Trip not found.");
  if (target === "in_progress" && user.id !== trip.driver_id) throw new ApiFailure(403,"Only the driver can start this trip.");
  let title = "Trip updated";
  if (target === "in_progress" && trip.status === "accepted") {
    con.prepare("UPDATE trips SET status='in_progress',started_at=? WHERE id=?").run(utcNow(),tripId); title = "Your trip has started";
  } else if (target === "completed" && trip.status === "in_progress" && user.id === trip.driver_id) {
    con.prepare("UPDATE trips SET status='completed',ended_at=?,latitude=NULL,longitude=NULL,location_updated_at=NULL WHERE id=?").run(utcNow(),tripId); title = "Trip completed";
    con.prepare("UPDATE rides SET status='open' WHERE id=? AND seats>1").run(trip.offer_id);
  } else if (target === "cancelled" && ["accepted","in_progress"].includes(trip.status)) {
    con.prepare("UPDATE trips SET status='cancelled',ended_at=?,latitude=NULL,longitude=NULL,location_updated_at=NULL WHERE id=?").run(utcNow(),tripId);
    con.prepare("UPDATE rides SET status='open' WHERE id IN (?,?)").run(trip.request_id,trip.offer_id); title = "Trip cancelled";
  } else throw new ApiFailure(409,"That trip status change is not available.");
  const status = target.replace("_"," ");
  const other = user.id === trip.passenger_id ? trip.driver_id : trip.passenger_id;
  notify(con,other,title,`${user.name} updated your trip to ${status}.`,"trip","trip",tripId);
  return { status: target };
}

export function updateTripLocation(user: CampusUser, tripId: number, input: Row) {
  requireVerified(user);
  const con = database();
  const trip = con.prepare("SELECT t.status,req.owner_id AS passenger_id,off.owner_id AS driver_id FROM trips t JOIN matches m ON m.id=t.match_id JOIN rides req ON req.id=m.request_id JOIN rides off ON off.id=m.offer_id WHERE t.id=?").get(tripId) as Row | undefined;
  if (!trip || ![trip.passenger_id,trip.driver_id].includes(user.id)) throw new ApiFailure(404,"Trip not found.");
  const latitude = Number(input.latitude); const longitude = Number(input.longitude);
  if (trip.status !== "in_progress" || user.id !== trip.driver_id) throw new ApiFailure(409,"Only the driver can share a location during an active trip.");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new ApiFailure(400,"Provide a valid latitude and longitude.");
  con.prepare("UPDATE trips SET latitude=?,longitude=?,location_updated_at=? WHERE id=?").run(latitude,longitude,utcNow(),tripId);
}

export function rateTrip(user: CampusUser, tripId: number, input: Row) {
  requireVerified(user);
  const con = database();
  const trip = con.prepare("SELECT t.status,req.owner_id AS passenger_id,off.owner_id AS driver_id FROM trips t JOIN matches m ON m.id=t.match_id JOIN rides req ON req.id=m.request_id JOIN rides off ON off.id=m.offer_id WHERE t.id=?").get(tripId) as Row | undefined;
  if (!trip || ![trip.passenger_id,trip.driver_id].includes(user.id)) throw new ApiFailure(404,"Trip not found.");
  if (trip.status !== "completed") throw new ApiFailure(409,"Feedback is available after a completed trip.");
  const score = Number(input.score); const comment = String(input.comment ?? "").trim().slice(0,400);
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new ApiFailure(400,"Choose a rating from 1 to 5.");
  const rated = user.id === trip.passenger_id ? trip.driver_id : trip.passenger_id;
  try { con.prepare("INSERT INTO ratings(trip_id,rater_id,rated_user_id,score,comment,created_at) VALUES(?,?,?,?,?,?)").run(tripId,user.id,rated,score,comment,utcNow()); }
  catch { throw new ApiFailure(409,"You already left feedback for this trip."); }
  notify(con,rated,"You received ride feedback",`${user.name} left feedback for your completed trip.`);
}

export function readNotification(user: CampusUser, notificationId: number) {
  database().prepare("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?").run(notificationId,user.id);
}

export function updateUser(admin: CampusUser, userId: number, input: Row) {
  requireAdmin(admin);
  const con = database(); const target = con.prepare("SELECT * FROM users WHERE id=? AND is_admin=0").get(userId) as Row | undefined;
  if (!target) throw new ApiFailure(404,"User not found.");
  if (input.verification_status !== undefined) {
    if (!["pending","verified","rejected"].includes(input.verification_status)) throw new ApiFailure(400,"Choose a valid verification status.");
    con.prepare("UPDATE users SET verification_status=? WHERE id=?").run(input.verification_status,userId);
    notify(con,userId,"Campus verification updated",`Your verification status is now ${input.verification_status}.`);
  }
  if (input.active !== undefined) con.prepare("UPDATE users SET active=? WHERE id=?").run(input.active ? 1 : 0,userId);
  con.prepare("INSERT INTO audit_log(actor_id,action,resource,created_at) VALUES(?,?,?,?)").run(admin.id,"updated user access",`user:${userId}`,utcNow());
}

export const sessionCookie = { name: COOKIE_NAME, ttl: TOKEN_TTL };
