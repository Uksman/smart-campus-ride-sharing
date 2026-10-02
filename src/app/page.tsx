"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

type Loose = any;
type PageKey = "overview" | "find" | "my-rides" | "matches" | "trips" | "notifications" | "admin" | "safety";
const titles: Record<PageKey, string> = {
  overview: "Overview", find: "Find a ride", "my-rides": "My rides", matches: "Suggested matches",
  trips: "Trips & feedback", notifications: "Notifications", admin: "Admin & verification", safety: "Safety & community",
};

function localDateTime(date = new Date(Date.now() + 60 * 60 * 1000)) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}
function formatDate(value: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time to be confirmed";
  return new Intl.DateTimeFormat(undefined, opts).format(date);
}
function initials(name = "Campus member") { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase(); }
function dayGreeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; }
function todayLabel() { return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "2-digit", year: "numeric" }).format(new Date()).toUpperCase(); }

async function api(path: string, body?: Loose, method = "POST") {
  const response = await fetch(`/api/${path}`, {
    method, credentials: "same-origin", cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload: Loose = {};
  try { payload = await response.json(); } catch { /* The error below remains actionable. */ }
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Try again.");
  return payload;
}

function Brand({ light = false }: { light?: boolean }) {
  return <a className={`brand ${light ? "brand-light" : ""}`} href="#overview" aria-label="CampusRide home"><span className="brand-mark">cr</span><span>campus<span className="brand-accent">ride</span></span></a>;
}

function RoutePreview({ compact = false }: { compact?: boolean }) {
  return <div className={`route-preview ${compact ? "route-preview-compact" : ""}`} aria-hidden="true">
    <svg viewBox="0 0 620 180" preserveAspectRatio="none"><path className="route-road" d="M-20 145 C90 134 82 22 210 50 S360 170 438 120 515 38 645 68"/><path className="route-road route-road-light" d="M-10 47 C80 60 144 128 214 102 S351 24 458 45 562 123 638 137"/><path className="route-path" d="M-20 145 C90 134 82 22 210 50 S360 170 438 120 515 38 645 68"/></svg>
    <span className="route-node route-node-start"></span><span className="route-node route-node-end"></span>
    <span className="route-place route-place-start">MAIN GATE</span><span className="route-place route-place-end">SHELTER AFRIQUE</span>
    <span className="route-car">↗</span>
  </div>;
}

function RideCard({ ride, actionLabel, onAction, secondary, onSecondary, busy }: { ride: Loose; actionLabel?: string; onAction?: () => void; secondary?: string; onSecondary?: () => void; busy?: boolean }) {
  const rating = Number(ride.owner_rating || 0);
  return <article className="ride-card">
    <div className="ride-card-top"><span className={`ride-type-mark ${ride.kind === "request" ? "request-mark" : "offer-mark"}`}>{ride.kind === "request" ? "↙" : "↗"}</span><span className="ride-kind">{ride.kind === "offer" ? "RIDE OFFER" : "RIDE REQUEST"}</span><span className="ride-card-time">{formatDate(ride.depart_at)}</span></div>
    <div className="ride-route"><div><span>{ride.origin}</span><small>Pickup</small></div><span className="route-dotted"><i>•</i><i>•</i><i>•</i></span><div><span>{ride.destination}</span><small>Destination</small></div></div>
    <div className="ride-card-meta"><span className="mini-user"><b className="mini-avatar">{initials(ride.owner_name)}</b><span>{ride.owner_name || "Campus member"}</span></span>{ride.kind === "offer" && <span className="seat-count">♧ {ride.seats} {Number(ride.seats) === 1 ? "seat" : "seats"}</span>}<span className="rating-display">{rating > 0 ? `★ ${rating.toFixed(1)}` : "New member"}</span></div>
    {ride.notes && <p className="ride-note">“{ride.notes}”</p>}
    {(actionLabel || secondary) && <div className="ride-card-actions">{actionLabel && <button className="button button-primary button-small" onClick={onAction} disabled={busy}>{busy ? <span className="spinner" /> : actionLabel}<span>↗</span></button>}{secondary && <button className="button button-quiet button-small" onClick={onSecondary}>{secondary}</button>}</div>}
  </article>;
}

function MatchCard({ match, isPassenger, onRespond, busy }: { match: Loose; isPassenger: boolean; onRespond: (action: string) => void; busy: boolean }) {
  const accepted = Boolean(isPassenger ? match.passenger_accepted : match.driver_accepted);
  const otherAccepted = Boolean(isPassenger ? match.driver_accepted : match.passenger_accepted);
  const origin = isPassenger ? match.offer_origin : match.request_origin;
  const destination = isPassenger ? match.offer_destination : match.request_destination;
  const departure = isPassenger ? match.offer_depart_at : match.request_depart_at;
  const otherName = isPassenger ? match.driver_name : match.passenger_name;
  return <article className="match-card">
    <div className="match-card-top"><span className="match-tag"><i></i> {match.status === "proposed" ? "SUGGESTED FOR YOU" : "RIDE CONFIRMED"}</span><span className="match-score"><b>{match.score}</b>% fit</span></div>
    <div className="match-route"><div className="match-stop"><b className="match-stop-dot"></b><div><small>FROM</small><strong>{origin}</strong></div></div><div className="match-route-line"><span></span><span></span><span></span></div><div className="match-stop"><b className="match-stop-dot end-stop"></b><div><small>GOING TO</small><strong>{destination}</strong></div></div></div>
    <div className="match-card-bottom"><div className="match-person"><span className="mini-avatar">{initials(otherName)}</span><span><strong>{otherName}</strong><small>{isPassenger ? "Driver · verified campus member" : "Passenger · verified campus member"}</small></span></div><span className="match-date">{formatDate(departure, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></div>
    {match.status === "proposed" && <div className="match-actions">{accepted ? <div className="waiting-confirmation"><span className="status-dot"></span>{otherAccepted ? "Both confirmed — creating your trip…" : "You accepted · waiting for their confirmation"}</div> : <><button className="button button-primary button-small" onClick={() => onRespond("accept")} disabled={busy}>{busy ? <span className="spinner" /> : "Accept match"}<span>↗</span></button><button className="text-button decline-button" onClick={() => onRespond("decline")} disabled={busy}>Pass on this</button></>}</div>}
  </article>;
}

export default function Home() {
  const [data, setData] = useState<Loose | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<PageKey>("overview");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<Loose | null>(null);
  const [browseMode, setBrowseMode] = useState<"offers" | "requests">("offers");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [ratingDraft, setRatingDraft] = useState<Record<number, { score: number; comment: string }>>({});
  const [locationWatch, setLocationWatch] = useState<number | null>(null);
  const locationWatchRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try { setData(await api("bootstrap", undefined, "GET")); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!data) return;
    const timer = window.setInterval(() => { void refresh(); }, 18000);
    return () => window.clearInterval(timer);
  }, [data, refresh]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3600); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => () => { if (locationWatchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(locationWatchRef.current); }, []);
  const action = useCallback(async (key: string, path: string, body: Loose, success: string, method = "POST"): Promise<boolean> => {
    setBusy(key);
    try { await api(path, body, method); setToast(success); await refresh(); return true; }
    catch (error) { setToast(error instanceof Error ? error.message : "Could not complete that action."); return false; }
    finally { setBusy(null); }
  }, [refresh]);

  const matches = data?.matches ?? [];
  const pendingMatches = matches.filter((match: Loose) => match.status === "proposed");
  const nextTrip = (data?.trips ?? []).find((trip: Loose) => ["accepted", "in_progress"].includes(trip.status));
  const openRides = browseMode === "offers" ? data?.open_offers ?? [] : data?.open_requests ?? [];
  const filteredRides = useMemo(() => openRides.filter((ride: Loose) => `${ride.origin} ${ride.destination} ${ride.owner_name}`.toLowerCase().includes(search.toLowerCase())), [openRides, search]);
  const isAdmin = Boolean(data?.user?.is_admin);
  const pendingAccounts = (data?.admin?.users ?? []).filter((user: Loose) => user.verification_status === "pending" && !user.is_admin).length;

  const showToast = (message: string) => setToast(message);
  const switchPage = (target: PageKey) => { setPage(target); setMenuOpen(false); if (target === "find") setSearch(""); };
  const openRideModal = (kind = "request", prefill: Loose = {}) => setModal({ kind, ...prefill });
  const editRide = (ride: Loose) => openRideModal(ride.kind, { rideId: ride.id, origin: ride.origin, destination: ride.destination, depart_at: localDateTime(new Date(ride.depart_at)), seats: ride.seats, notes: ride.notes });

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAuthError(""); setBusy("auth");
    const fields = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api(authMode === "login" ? "auth/login" : "auth/register", fields);
      await refresh(); setPage("overview");
      if (authMode === "register") setToast("Access requested. An administrator will review your campus ID.");
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Unable to continue."); }
    finally { setBusy(null); }
  }

  async function demoLogin(email: string) {
    setAuthMode("login"); setAuthError(""); setBusy("auth");
    try { await api("auth/login", { email, password: "CampusRide!23" }); await refresh(); setPage("overview"); }
    catch (error) { setAuthError(error instanceof Error ? error.message : "Unable to sign in."); }
    finally { setBusy(null); }
  }

  async function logout() {
    try { await api("auth/logout", {}); } catch { /* Clear the client view either way. */ }
    if (locationWatchRef.current !== null) { navigator.geolocation?.clearWatch(locationWatchRef.current); locationWatchRef.current = null; setLocationWatch(null); }
    setData(null); setPage("overview"); setMenuOpen(false);
  }

  async function submitRide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!modal) return;
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("depart_at") || "");
    const editId = modal.rideId;
    const created = await action(editId ? `edit-ride-${editId}` : "create-ride", editId ? `rides/${editId}` : "rides", {
      kind: String(form.get("kind")), origin: String(form.get("origin")), destination: String(form.get("destination")),
      depart_at: new Date(raw).toISOString(), seats: Number(form.get("seats") || 1), notes: String(form.get("notes") || ""),
    }, editId ? "Ride details updated. We’ll refresh your match suggestions." : "Your ride is live. We’ll suggest compatible matches.", editId ? "PATCH" : "POST");
    if (created) setModal(null);
  }

  async function requestFromOffer(ride: Loose) {
    const time = new Date(ride.depart_at);
    const now = new Date();
    if (time < now) time.setTime(now.getTime() + 15 * 60000);
    await action(`offer-${ride.id}`, "rides", { kind: "request", origin: ride.origin, destination: ride.destination, depart_at: time.toISOString(), seats: 1, notes: "Looking to share this route." }, "Ride request posted. Check Suggested matches for confirmations.");
  }

  async function offerToRequest(ride: Loose) {
    let departure = new Date(ride.depart_at);
    if (departure < new Date()) departure = new Date(Date.now() + 20 * 60000);
    openRideModal("offer", { origin: ride.origin, destination: ride.destination, depart_at: localDateTime(departure), seats: 1, notes: "" });
  }

  function startLocationSharing(tripId: number) {
    if (!navigator.geolocation) { showToast("Location sharing is unavailable in this browser."); return; }
    if (locationWatchRef.current !== null) { navigator.geolocation.clearWatch(locationWatchRef.current); locationWatchRef.current = null; setLocationWatch(null); showToast("Location sharing paused."); return; }
    let lastSent = 0;
    const id = navigator.geolocation.watchPosition(async position => {
      if (Date.now() - lastSent < 15000) return;
      lastSent = Date.now();
      try { await api(`trips/${tripId}/location`, { latitude: position.coords.latitude, longitude: position.coords.longitude }); }
      catch { /* Location will resume on the next permitted update. */ }
    }, error => showToast(error.code === 1 ? "Allow location access in your browser to share your position." : "Could not read your current location."), { enableHighAccuracy: true, maximumAge: 12000, timeout: 15000 });
    locationWatchRef.current = id; setLocationWatch(id); showToast("Live location sharing is on for this trip.");
  }

  if (loading) return <div className="loading-screen"><div className="loading-mark">cr</div><span>Getting your campus ready…</span></div>;

  if (!data) return <>
    {toast && <div className="toast toast-floating"><span className="toast-mark">✓</span>{toast}<button onClick={() => setToast("")} aria-label="Dismiss">×</button></div>}
    <section className="auth-shell">
      <div className="auth-story">
        <div className="story-topline"><Brand light /><span className="campus-pill"><span className="status-dot"></span> UNIVERSITY OF UYO</span></div>
        <div className="story-copy"><p className="eyebrow light-eyebrow">MOVE TOGETHER</p><h1>Campus days,<br/><em>better connected.</em></h1><p>Find a seat, share your route, and make the campus journey a little easier — with people from your university community.</p></div>
        <div className="story-route"><div className="map-canvas"><RoutePreview/><div className="map-glass">Today’s campus network <span>● Community rides</span></div></div></div>
        <div className="story-footer"><span>Built around your campus</span><span className="story-footer-line"></span><span>Made for the way you move</span></div>
      </div>
      <div className="auth-panel">
        <div className="auth-mobile-brand"><Brand/></div>
        <div className="auth-card">
          <div><p className="eyebrow">{authMode === "login" ? "YOUR CAMPUS, IN MOTION" : "JOIN YOUR CAMPUS"}</p><h2>{authMode === "login" ? "Welcome back" : "Create your account"}</h2><p className="subtle">{authMode === "login" ? "Sign in to find your next shared ride." : "Campus access is approved by an administrator."}</p></div>
          <form className="form-stack" onSubmit={submitAuth} key={authMode}>
            {authMode === "register" ? <>
              <div className="field-row"><label>Full name<input name="name" autoComplete="name" placeholder="Your name" required maxLength={80}/></label><label>Campus role<select name="role"><option value="student">Student</option><option value="staff">Staff</option></select></label></div>
              <label>University email<input name="email" type="email" autoComplete="email" placeholder="you@uniuyo.edu.ng" required/></label>
              <div className="field-row"><label>Matric / staff ID<input name="campus_id" placeholder="e.g. 21/SC/CO/1078" required maxLength={40}/></label><label>Phone number<input name="phone" type="tel" autoComplete="tel" placeholder="+234 ..." required/></label></div>
              <label>Password<input name="password" type="password" autoComplete="new-password" placeholder="At least 10 characters" required minLength={10}/></label>
              <p className="form-note"><span>◇</span> Your account stays pending until a campus administrator verifies your ID.</p>
            </> : <>
              <label>Email address<input name="email" type="email" autoComplete="username" defaultValue="" placeholder="you@uniuyo.edu.ng" required/></label>
              <label>Password<input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required/></label>
            </>}
            {authError && <div className="auth-error" role="alert">{authError}</div>}
            <button className="button button-primary button-wide" type="submit" disabled={busy === "auth"}>{busy === "auth" ? <span className="spinner"/> : authMode === "login" ? "Sign in" : "Request campus access"}<span>↗</span></button>
          </form>
          <div className="auth-switch"><span>{authMode === "login" ? "New to CampusRide?" : "Already have an account?"}</span><button className="text-button" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}>{authMode === "login" ? "Create an account" : "Sign in"}</button></div>
          {authMode === "login" && <div className="demo-access"><div className="demo-heading"><span className="demo-icon">✳</span><div><strong>Try the demo</strong><small>Explore with a verified campus account</small></div><span className="demo-chevron">⌄</span></div><div className="demo-buttons">
            <button type="button" className="demo-account" onClick={() => void demoLogin("amara@student.uniuyo.edu.ng")}><span className="demo-avatar avatar-green">A</span><span><strong>Amara Nwosu</strong><small>Student · rider</small></span><span className="demo-open">↗</span></button>
            <button type="button" className="demo-account" onClick={() => void demoLogin("tunde.driver@student.uniuyo.edu.ng")}><span className="demo-avatar avatar-sand">T</span><span><strong>Tunde Ekanem</strong><small>Student · driver</small></span><span className="demo-open">↗</span></button>
            <button type="button" className="demo-account" onClick={() => void demoLogin("admin@campus.local")}><span className="demo-avatar avatar-ink">U</span><span><strong>Campus Support</strong><small>Administrator</small></span><span className="demo-open">↗</span></button>
            <p className="demo-password">Shared demo password <code>CampusRide!23</code></p>
          </div></div>}
          <p className="auth-legal">By continuing, you agree to use CampusRide respectfully and follow campus transport guidance.</p>
        </div>
        <div className="auth-bottom"><span>© CampusRide · University of Uyo</span><span>Help & safety</span></div>
      </div>
    </section>
  </>;

  const user = data.user;
  const verified = user.verification_status === "verified";
  const verifiedLabel = verified ? "Verified member" : user.verification_status === "rejected" ? "Verification needs attention" : "Verification pending";
  const openOffers = data.open_offers ?? [];
  const activity = data.my_rides ?? [];

  function renderOverview() {
    const quickMatch = pendingMatches.slice(0, 2);
    const suggestedOffer = openOffers.slice(0, 1);
    return <>
      <div className="page-heading-row"><div><p className="eyebrow">{todayLabel()}</p><h1>{dayGreeting()}, {user.name.split(" ")[0]}<span className="heading-period">.</span></h1><p className="subtle">A better trip can start with a shared seat.</p></div><button className="button button-primary" onClick={() => openRideModal("request")}><span className="button-plus">＋</span> Post a ride <span>↗</span></button></div>
      {!verified && <div className={`verification-banner ${user.verification_status === "rejected" ? "verification-rejected" : ""}`}><span className="verification-symbol">◇</span><div><strong>{verifiedLabel}</strong><p>{user.verification_status === "rejected" ? "Please contact campus support to resolve your verification." : "Your profile is ready. Ride posting and matching open once your campus ID is approved."}</p></div>{isAdmin && <button className="text-button" onClick={() => switchPage("admin")}>Review access ↗</button>}</div>}
      <div className="metric-grid">
        <div className="metric-card"><span className="metric-icon mint">◇</span><div><span className="metric-label">YOUR OPEN RIDES</span><strong>{data.metrics.active_rides}</strong><small>requests or offers</small></div><span className="metric-spark">⌁</span></div>
        <div className="metric-card"><span className="metric-icon peach">⟷</span><div><span className="metric-label">SUGGESTED MATCHES</span><strong>{pendingMatches.length}</strong><small>waiting for review</small></div><span className="metric-spark">↗</span></div>
        <div className="metric-card"><span className="metric-icon pale">▣</span><div><span className="metric-label">COMPLETED TRIPS</span><strong>{data.metrics.completed_trips}</strong><small>rides shared</small></div><span className="metric-spark">⌁</span></div>
      </div>
      <section className="welcome-panel">
        <div className="welcome-copy"><span className="welcome-chip"><i></i> CAMPUS MOBILITY, MADE SIMPLE</span><h2>Where are you<br/>headed next?</h2><p>Find someone travelling your way, or offer an empty seat to a fellow campus member.</p><div className="welcome-actions"><button className="button button-light" onClick={() => switchPage("find")}>Explore rides <span>↗</span></button><button className="button button-outline-light" onClick={() => openRideModal("offer")}>Offer a seat <span>＋</span></button></div></div>
        <div className="welcome-art"><RoutePreview/><div className="art-landmark landmark-library"><span>▤</span> University Library</div><div className="art-landmark landmark-hostel"><span>⌂</span> Student Hostels</div><div className="art-path-label">YOUR CAMPUS ROUTE <b>↗</b></div></div>
        <span className="welcome-decoration decoration-one"></span><span className="welcome-decoration decoration-two"></span>
      </section>
      <div className="section-heading-row"><div><p className="eyebrow">GOOD ROUTES, GOOD COMPANY</p><h2>Suggested for you</h2></div><button className="link-button" onClick={() => switchPage("matches")}>All suggestions <span>→</span></button></div>
      <div className="content-grid content-grid-overview">
        <section className="card-section"><div className="card-section-head"><div><span className="section-icon">⟷</span><div><h3>Matches to review</h3><p>People whose route and time may line up.</p></div></div><span className="soft-count">{pendingMatches.length} new</span></div>
          {quickMatch.length ? <div className="match-list compact-matches">{quickMatch.map((match: Loose) => <MatchCard key={match.id} match={match} isPassenger={Boolean(match.is_passenger)} busy={busy === `match-${match.id}`} onRespond={actionName => void action(`match-${match.id}`, `matches/${match.id}/respond`, { action: actionName }, actionName === "accept" ? "Your response is in." : "Suggestion passed.")}/>)}</div> : <EmptyState icon="⟷" title="No suggestions yet" copy="Post a request or offer and we’ll look for compatible campus trips." action="Post a ride" onAction={() => openRideModal("request")}/>}
        </section>
        <section className="card-section next-trip-section"><div className="card-section-head"><div><span className="section-icon trip-icon">▣</span><div><h3>Your next trip</h3><p>Keep an eye on the ride details.</p></div></div></div>
          {nextTrip ? <div className="next-trip-card"><div className="next-trip-status"><span className={`trip-status-dot trip-${nextTrip.status}`}></span>{nextTrip.status.replace("_", " ")}</div><h4>{nextTrip.origin} <span>→</span> {nextTrip.destination}</h4><p>{formatDate(nextTrip.depart_at)}</p><div className="next-trip-person"><span className="mini-avatar">{initials(nextTrip.passenger_id === user.id ? nextTrip.driver_name : nextTrip.passenger_name)}</span><span>{nextTrip.passenger_id === user.id ? nextTrip.driver_name : nextTrip.passenger_name}<small>{nextTrip.passenger_id === user.id ? "Your driver" : "Your passenger"}</small></span></div><button className="link-button" onClick={() => switchPage("trips")}>Open trip details →</button></div> : <div className="empty-trip"><div className="empty-trip-icon">⌖</div><strong>Nothing on your itinerary</strong><p>When you confirm a match, your trip will appear here.</p><button className="button button-quiet button-small" onClick={() => switchPage("find")}>Browse available rides <span>↗</span></button></div>}
        </section>
      </div>
      {suggestedOffer.length > 0 && <><div className="section-heading-row section-heading-small"><div><p className="eyebrow">TRAVELLING SOON</p><h2>Open seats on your routes</h2></div><button className="link-button" onClick={() => switchPage("find")}>See all rides <span>→</span></button></div><div className="ride-grid">{suggestedOffer.map((ride: Loose) => <RideCard key={ride.id} ride={ride} actionLabel="Request this ride" onAction={() => void requestFromOffer(ride)} busy={busy === `offer-${ride.id}`}/>)}</div></>}
    </>;
  }

  function renderFind() {
    const rides = browseMode === "offers" ? data.open_offers ?? [] : data.open_requests ?? [];
    return <>
      <div className="page-heading-row"><div><p className="eyebrow">FIND YOUR WAY</p><h1>Good rides start here<span className="heading-period">.</span></h1><p className="subtle">Connect with verified University of Uyo students and staff.</p></div><button className="button button-primary" onClick={() => openRideModal("request")}><span className="button-plus">＋</span> Post a ride <span>↗</span></button></div>
      <div className="find-banner"><div className="find-banner-copy"><span className="welcome-chip"><i></i> CAMPUS ROUTES</span><h2>Going somewhere?</h2><p>See who is already headed that way. Shared trips are coordinated directly between members.</p></div><div className="find-route-map"><RoutePreview compact/><div className="map-legend"><span><i className="legend-pickup"></i> Frequent campus pickup</span><span><i className="legend-route"></i> Popular routes</span></div></div></div>
      <div className="browse-toolbar"><div className="segmented-control"><button className={browseMode === "offers" ? "selected" : ""} onClick={() => setBrowseMode("offers")}>Ride offers <span>{(data.open_offers ?? []).length}</span></button><button className={browseMode === "requests" ? "selected" : ""} onClick={() => setBrowseMode("requests")}>Passengers looking <span>{(data.open_requests ?? []).length}</span></button></div><label className="search-field"><span>⌕</span><input aria-label="Search route" placeholder="Search campus or destination" value={search} onChange={event => setSearch(event.target.value)}/><kbd>⌕</kbd></label></div>
      {!verified && <div className="inline-notice"><span>◇</span> Your campus account is pending approval. You can explore, but cannot post or accept a match yet.</div>}
      {filteredRides.length ? <div className="ride-grid">{filteredRides.map((ride: Loose) => <RideCard key={ride.id} ride={ride} actionLabel={browseMode === "offers" ? "Request this ride" : "Offer a seat"} onAction={() => browseMode === "offers" ? void requestFromOffer(ride) : offerToRequest(ride)} busy={busy === `offer-${ride.id}`}/>)}</div> : <EmptyState icon="⌕" title={search ? "No routes found" : browseMode === "offers" ? "No open offers right now" : "No open passenger requests"} copy={search ? "Try a different campus point or destination." : "Post a ride request or offer a seat to start finding your campus match."} action={browseMode === "offers" ? "Request a ride" : "Offer a seat"} onAction={() => browseMode === "offers" ? openRideModal("request") : openRideModal("offer")}/>}
      <p className="map-disclaimer"><span>◇</span> Routes are matched by campus landmark and departure time. Live maps connect when a mapping service is configured.</p>
    </>;
  }

  function renderMyRides() {
    return <>
      <div className="page-heading-row"><div><p className="eyebrow">YOUR RIDE ACTIVITY</p><h1>My rides<span className="heading-period">.</span></h1><p className="subtle">Manage requests and seats you’ve shared with the community.</p></div><button className="button button-primary" onClick={() => openRideModal("request")}><span className="button-plus">＋</span> Create a ride <span>↗</span></button></div>
      <div className="my-ride-summary"><div><span className="summary-symbol">◇</span><span><strong>{activity.filter((ride: Loose) => ride.status === "open").length} open rides</strong><small>Requests and offers visible to verified members</small></span></div><button className="button button-quiet button-small" onClick={() => openRideModal("offer")}>Offer a seat <span>↗</span></button></div>
      {activity.length ? <div className="my-rides-list">{activity.map((ride: Loose) => <article className="my-ride-card" key={ride.id}><div className={`my-ride-icon ${ride.kind === "offer" ? "offer-mark" : "request-mark"}`}>{ride.kind === "offer" ? "↗" : "↙"}</div><div className="my-ride-main"><div className="my-ride-title-row"><span className="ride-kind">{ride.kind === "offer" ? "YOUR RIDE OFFER" : "YOUR RIDE REQUEST"}</span><StatusPill status={ride.status}/></div><h3>{ride.origin} <span>→</span> {ride.destination}</h3><p>{formatDate(ride.depart_at)}{ride.kind === "offer" ? ` · ${ride.seats} seat${Number(ride.seats) === 1 ? "" : "s"}` : ""}</p>{ride.notes && <small className="my-ride-note">{ride.notes}</small>}</div><div className="my-ride-side">{ride.status === "open" && <button className="link-button" onClick={() => editRide(ride)}>Edit ride <span>↗</span></button>}<button className="link-button" onClick={() => switchPage("matches")}>Related matches <span>→</span></button>{ride.status === "open" && <button className="text-button cancel-link" onClick={() => void action(`cancel-${ride.id}`, `rides/${ride.id}/cancel`, {}, "Ride cancelled.")}>Cancel ride</button>}</div></article>)}</div> : <EmptyState icon="◇" title="Your rides will show up here" copy="Request a seat or publish an offer to start connecting with campus members." action="Create your first ride" onAction={() => openRideModal("request")}/>}
    </>;
  }

  function renderMatches() {
    const activeMatches = matches.filter((match: Loose) => match.status !== "rejected");
    return <>
      <div className="page-heading-row"><div><p className="eyebrow">ROUTE + TIME + CAPACITY</p><h1>Suggested matches<span className="heading-period">.</span></h1><p className="subtle">Review each suggestion. Both people confirm before a trip is created.</p></div><button className="button button-quiet" onClick={() => switchPage("find")}>Explore more rides <span>↗</span></button></div>
      <div className="match-explainer"><span className="explainer-icon">✳</span><div><strong>How matching works</strong><p>We compare your pickup, destination and departure window. A trip appears after both the passenger and driver accept.</p></div><span className="explainer-route">⟷</span></div>
      {activeMatches.length ? <div className="match-page-grid">{activeMatches.map((match: Loose) => <MatchCard key={match.id} match={match} isPassenger={Boolean(match.is_passenger)} busy={busy === `match-${match.id}`} onRespond={actionName => void action(`match-${match.id}`, `matches/${match.id}/respond`, { action: actionName }, actionName === "accept" ? "Your confirmation is saved." : "Suggestion passed.")}/>)}</div> : <EmptyState icon="⟷" title="No match suggestions yet" copy="Create an open ride request or offer and compatible campus members will appear here." action="Post a ride" onAction={() => openRideModal("request")}/>}
    </>;
  }

  function renderTrips() {
    const trips = data.trips ?? [];
    return <>
      <div className="page-heading-row"><div><p className="eyebrow">YOUR SHARED JOURNEYS</p><h1>Trips & feedback<span className="heading-period">.</span></h1><p className="subtle">Follow confirmed rides and leave feedback after each trip.</p></div><div className="trip-page-count"><strong>{trips.length}</strong><span>total trips</span></div></div>
      {trips.length ? <div className="trip-list">{trips.map((trip: Loose) => {
        const isPassenger = trip.passenger_id === user.id;
        const other = isPassenger ? trip.driver_name : trip.passenger_name;
        const canRate = trip.status === "completed" && !trip.my_rating_submitted;
        return <article className="trip-card" key={trip.id}>
          <div className="trip-card-head"><span className="trip-number">TRIP #{String(trip.id).padStart(3,"0")}</span><StatusPill status={trip.status}/><span className="trip-date">{formatDate(trip.depart_at)}</span></div>
          <div className="trip-layout"><div className="trip-details"><div className="trip-heading"><div><h3>{trip.origin}</h3><small>Pickup</small></div><div className="trip-connector"><span>·········</span><b>↗</b></div><div><h3>{trip.destination}</h3><small>Destination</small></div></div><div className="trip-companion"><span className="mini-avatar">{initials(other)}</span><span><strong>{other}</strong><small>{isPassenger ? "Your driver" : "Your passenger"} · verified campus member</small></span><span className="rating-display">★ 5.0</span></div>
            {trip.status === "in_progress" && <div className="tracking-panel"><div className="tracking-heading"><span className="live-pulse"></span><strong>Live trip</strong><small>{trip.location_updated_at ? `Updated ${formatDate(trip.location_updated_at,{hour:"numeric",minute:"2-digit"})}` : "Waiting for location"}</small></div>{trip.latitude != null ? <p>Driver location: {Number(trip.latitude).toFixed(4)}, {Number(trip.longitude).toFixed(4)}</p> : <p>The driver’s location will appear here when sharing starts.</p>}{!isPassenger && <button className="text-button" onClick={() => startLocationSharing(trip.id)}>{locationWatch === null ? "Share my live location" : "Pause location sharing"} ↗</button>}</div>}
            {canRate && <form className="rating-form" onSubmit={event => { event.preventDefault(); const draft = ratingDraft[trip.id] || { score: 5, comment: "" }; void action(`rate-${trip.id}`, `trips/${trip.id}/rating`, draft, "Thanks for sharing feedback."); }}><div><strong>How was your trip?</strong><small>Your feedback helps keep the campus community accountable.</small></div><div className="rating-select" aria-label="Choose a rating">{[1,2,3,4,5].map(score => <button className={score <= (ratingDraft[trip.id]?.score || 5) ? "selected" : ""} type="button" key={score} onClick={() => setRatingDraft(prev => ({ ...prev, [trip.id]: { score, comment: prev[trip.id]?.comment || "" } }))} aria-label={`${score} stars`}>★</button>)}</div><input placeholder="Add a short note (optional)" value={ratingDraft[trip.id]?.comment || ""} onChange={event => setRatingDraft(prev => ({ ...prev, [trip.id]: { score: prev[trip.id]?.score || 5, comment: event.target.value } }))}/><button type="submit" className="button button-primary button-small" disabled={busy === `rate-${trip.id}`}>{busy === `rate-${trip.id}` ? "Saving…" : "Send feedback"} <span>↗</span></button></form>}
            {trip.my_rating_submitted && <div className="feedback-saved"><span>★</span> Your feedback was recorded. Thanks for helping the community.</div>}
          </div><div className="trip-illustration"><RoutePreview compact/><div className="trip-illustration-label">CAMPUS ROUTE <span>✳</span></div></div></div>
          <div className="trip-card-footer"><span className="privacy-note">◇ Trip details are visible to confirmed participants.</span><div className="trip-actions">{trip.status === "accepted" && !isPassenger && <button className="button button-primary button-small" onClick={() => void action(`trip-${trip.id}`, `trips/${trip.id}/status`, { status: "in_progress" }, "Trip started.")}>Start trip <span>↗</span></button>}{trip.status === "in_progress" && !isPassenger && <button className="button button-primary button-small" onClick={() => { if (locationWatchRef.current !== null) { navigator.geolocation?.clearWatch(locationWatchRef.current); locationWatchRef.current = null; setLocationWatch(null); } void action(`trip-${trip.id}`, `trips/${trip.id}/status`, { status: "completed" }, "Trip completed. Invite your passenger to leave feedback."); }}>Complete trip <span>✓</span></button>}{["accepted","in_progress"].includes(trip.status) && <button className="text-button cancel-link" onClick={() => { if (locationWatchRef.current !== null) { navigator.geolocation?.clearWatch(locationWatchRef.current); locationWatchRef.current = null; setLocationWatch(null); } void action(`trip-cancel-${trip.id}`, `trips/${trip.id}/status`, { status: "cancelled" }, "Trip cancelled."); }}>Cancel trip</button>}</div></div>
        </article>;
      })}</div> : <EmptyState icon="▣" title="No confirmed trips yet" copy="When you and another member accept the same match, trip details will appear here." action="Review matches" onAction={() => switchPage("matches")}/>}
    </>;
  }

  function renderNotifications() {
    const items = data.notifications ?? [];
    return <>
      <div className="page-heading-row"><div><p className="eyebrow">A LITTLE CAMPUS UPDATE</p><h1>Notifications<span className="heading-period">.</span></h1><p className="subtle">Match responses, verification changes and trip updates.</p></div><span className="notifications-count">{data.unread_count} unread</span></div>
      {items.length ? <div className="notification-list">{items.map((item: Loose) => <button className={`notification-item ${item.is_read ? "is-read" : ""}`} key={item.id} onClick={() => void action(`notice-${item.id}`, `notifications/${item.id}/read`, {}, "Notification marked as read.")}><span className={`notice-icon notice-${item.kind}`}>{item.kind === "match" ? "⟷" : item.kind === "trip" ? "▣" : "✳"}</span><span className="notice-copy"><strong>{item.title}</strong><span>{item.message}</span><small>{formatDate(item.created_at)}</small></span>{!item.is_read && <i className="unread-dot"></i>}<span className="notice-arrow">→</span></button>)}</div> : <EmptyState icon="♧" title="All quiet for now" copy="We’ll bring your ride and account updates here."/>}
    </>;
  }

  function renderAdmin() {
    if (!isAdmin) return <EmptyState icon="⌘" title="Administrator access required" copy="This workspace is available to designated campus support staff."/>;
    const users = data.admin?.users ?? [];
    const candidates = users.filter((account: Loose) => !account.is_admin);
    return <>
      <div className="page-heading-row"><div><p className="eyebrow">CAMPUS OPERATIONS</p><h1>Admin & verification<span className="heading-period">.</span></h1><p className="subtle">Review campus identities and keep the ride community trusted.</p></div><span className="admin-lock">◇ Restricted access</span></div>
      <div className="admin-stats"><AdminMetric label="CAMPUS MEMBERS" count={data.admin?.counts.users ?? 0} tone="green"/><AdminMetric label="NEEDS REVIEW" count={data.admin?.counts.pending ?? 0} tone="orange"/><AdminMetric label="OPEN RIDES" count={data.admin?.counts.rides ?? 0} tone="lavender"/><AdminMetric label="TRIPS CREATED" count={data.admin?.counts.trips ?? 0} tone="blue"/></div>
      <section className="admin-section"><div className="admin-section-head"><div><p className="eyebrow">CAMPUS ID CHECK</p><h2>Verification queue</h2><p>Approve campus members after checking their student or staff ID through the university’s records process.</p></div><span className="soft-count">{pendingAccounts} pending</span></div>
        {candidates.length ? <div className="admin-user-list">{candidates.map((account: Loose) => <article className="admin-user-card" key={account.id}><span className="admin-user-avatar">{initials(account.name)}</span><div className="admin-user-main"><div className="admin-user-title"><strong>{account.name}</strong><StatusPill status={account.verification_status}/></div><p>{account.email} · {account.phone}</p><small>{account.role === "student" ? "Student" : "Staff"} ID <b>{account.campus_id}</b> · joined {formatDate(account.created_at,{month:"short",day:"numeric",year:"numeric"})}</small></div><div className="admin-user-actions">{account.verification_status !== "verified" && <button className="button button-primary button-small" onClick={() => void action(`verify-${account.id}`, `admin/users/${account.id}`, { verification_status: "verified" }, "Campus access approved.", "PATCH")}>Approve access <span>✓</span></button>}{account.verification_status === "verified" && <button className="button button-quiet button-small" onClick={() => void action(`unverify-${account.id}`, `admin/users/${account.id}`, { verification_status: "pending" }, "Verification returned to review.", "PATCH")}>Return to review</button>}{account.verification_status !== "rejected" && <button className="text-button cancel-link" onClick={() => void action(`reject-${account.id}`, `admin/users/${account.id}`, { verification_status: "rejected" }, "Access request rejected.", "PATCH")}>Reject</button>}</div></article>)}</div> : <div className="admin-empty"><span>✳</span><strong>Review queue is clear</strong><p>New campus access requests will appear here.</p></div>}
      </section>
      <section className="admin-section recent-ride-section"><div className="admin-section-head"><div><p className="eyebrow">PLATFORM ACTIVITY</p><h2>Recent ride records</h2><p>Operational overview for campus support.</p></div></div><div className="admin-rides-table"><div className="admin-table-head"><span>RIDE</span><span>MEMBER</span><span>DEPARTURE</span><span>STATUS</span></div>{(data.admin?.recent_rides ?? []).map((ride: Loose) => <div className="admin-table-row" key={ride.id}><span><b>{ride.origin}</b> → {ride.destination}<small>{ride.kind === "offer" ? "Ride offer" : "Ride request"}</small></span><span>{ride.owner_name}</span><span>{formatDate(ride.depart_at)}</span><StatusPill status={ride.status}/></div>)}</div></section>
    </>;
  }

  function renderSafety() {
    return <>
      <div className="page-heading-row"><div><p className="eyebrow">LOOK OUT FOR EACH OTHER</p><h1>Safety & community<span className="heading-period">.</span></h1><p className="subtle">Simple habits help make every shared campus ride more comfortable.</p></div><span className="safety-emblem">✳</span></div>
      <div className="safety-intro"><span className="safety-emblem-large">◇</span><div><span className="welcome-chip"><i></i> CAMPUS COMMUNITY</span><h2>Share with confidence.</h2><p>CampusRide is designed around verified University of Uyo members. Verification, trip records and feedback all help support accountable coordination.</p></div></div>
      <div className="safety-grid"><SafetyCard num="01" icon="◎" title="Meet at a clear pickup point" copy="Agree on a familiar campus landmark and confirm the details in person before you set off."/><SafetyCard num="02" icon="◇" title="Check the trip details" copy="Confirm the destination, departure time and other person’s name before starting a trip."/><SafetyCard num="03" icon="⌖" title="Share your trip status" copy="Use trip updates and location sharing during an active ride when it makes sense for your journey."/><SafetyCard num="04" icon="✳" title="Leave honest feedback" copy="After a completed trip, share respectful, useful feedback so the campus community can make informed choices."/></div>
      <div className="safety-note"><span>i</span><p>Campus verification and location sharing support safer coordination, but do not guarantee personal safety. Trust your judgement and contact campus support or local emergency services if you need urgent help.</p></div>
    </>;
  }

  let content: ReactNode;
  if (page === "overview") content = renderOverview();
  else if (page === "find") content = renderFind();
  else if (page === "my-rides") content = renderMyRides();
  else if (page === "matches") content = renderMatches();
  else if (page === "trips") content = renderTrips();
  else if (page === "notifications") content = renderNotifications();
  else if (page === "admin") content = renderAdmin();
  else content = renderSafety();

  return <div className="app-shell">
    {toast && <div className="toast toast-floating"><span className="toast-mark">✓</span>{toast}<button onClick={() => setToast("")} aria-label="Dismiss">×</button></div>}
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand-row"><Brand light/><button className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button></div>
      <div className="campus-selector"><span className="selector-crest">U</span><span><strong>University of Uyo</strong><small>Akwa Ibom, Nigeria</small></span><span className="selector-chevron">⌄</span></div>
      <div className="side-label">YOUR SPACE</div>
      <nav className="primary-nav" aria-label="Main navigation">
        <NavButton icon="◫" target="overview" page={page} switchPage={switchPage}>Overview</NavButton>
        <NavButton icon="⌕" target="find" page={page} switchPage={switchPage}>Find a ride</NavButton>
        <NavButton icon="◇" target="my-rides" page={page} switchPage={switchPage}>My rides</NavButton>
        <NavButton icon="⟷" target="matches" page={page} switchPage={switchPage} count={pendingMatches.length}>Suggested matches</NavButton>
        <NavButton icon="▣" target="trips" page={page} switchPage={switchPage}>Trips & feedback</NavButton>
      </nav>
      <div className="side-label side-label-spaced">COMMUNITY</div>
      <nav className="primary-nav" aria-label="Community navigation">
        <NavButton icon="♧" target="notifications" page={page} switchPage={switchPage} count={data.unread_count}>Notifications</NavButton>
        {isAdmin && <NavButton icon="⌘" target="admin" page={page} switchPage={switchPage} count={pendingAccounts} alert>Admin & verification</NavButton>}
      </nav>
      <div className="sidebar-grow"></div>
      <div className="safe-card"><span className="safe-icon">✳</span><div><strong>Ride with care</strong><p>Share trips only with verified campus members.</p><button onClick={() => switchPage("safety")}>Safety guidelines <span>↗</span></button></div></div>
      <div className={`profile-wrap ${profileOpen ? "open" : ""}`}><button className="profile-mini" onClick={() => setProfileOpen(value => !value)} title="Account menu" aria-expanded={profileOpen}><span className="profile-avatar">{initials(user.name)}</span><span className="profile-mini-copy"><strong>{user.name}</strong><small>{verifiedLabel}</small></span><span className="profile-more">•••</span></button><button className="profile-signout" onClick={logout}>Sign out <span>↗</span></button></div>
    </aside>
    <button className={`sidebar-scrim ${menuOpen ? "scrim-visible" : ""}`} aria-label="Close navigation" onClick={() => setMenuOpen(false)}></button>
    <div className="app-main">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open navigation">☰</button><div className="breadcrumb"><span>CampusRide</span><span className="crumb-slash">/</span><strong>{titles[page]}</strong></div></div><div className="topbar-right"><div className="connection-pill"><span className="status-dot"></span><span>Campus network</span></div><button className="topbar-notice" onClick={() => switchPage("notifications")} aria-label="Notifications"><span>♧</span>{data.unread_count > 0 && <i/>}</button><span className="topbar-separator"></span><span className="topbar-campus">UYO <span>✳</span></span></div></header>
      <main className="page-content" key={page}>{page === "overview" && !verified ? <div className="pending-title-note"><span>◇</span> Your profile is ready. Some features unlock after verification.</div> : null}{content}</main>
      <footer className="app-footer"><span>© 2026 CampusRide · University of Uyo</span><span><i className="footer-status-dot"></i> Service ready</span><button onClick={() => switchPage("safety")}>Safety & community</button></footer>
    </div>
    {modal && <RideModal modal={modal} landmarks={data.landmarks} onClose={() => setModal(null)} onSubmit={submitRide} busy={busy === "create-ride"}/>}
  </div>;
}

function NavButton({ icon, target, page, switchPage, count = 0, alert = false, children }: { icon: string; target: PageKey; page: PageKey; switchPage: (page: PageKey) => void; count?: number; alert?: boolean; children: ReactNode }) {
  return <button className={`nav-item ${page === target ? "active" : ""}`} onClick={() => switchPage(target)}><span className="nav-icon">{icon}</span><span>{children}</span>{count > 0 && <span className={`nav-count ${alert ? "alert-count" : ""}`}>{count}</span>}</button>;
}

function EmptyState({ icon, title, copy, action, onAction }: { icon: string; title: string; copy: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-state-icon">{icon}</div><h3>{title}</h3><p>{copy}</p>{action && <button className="button button-primary button-small" onClick={onAction}>{action} <span>↗</span></button>}</div>;
}

function StatusPill({ status }: { status: string }) {
  const label = status.replace("_", " ");
  return <span className={`status-pill status-${status}`}><i></i>{label}</span>;
}

function AdminMetric({ label, count, tone }: { label: string; count: number; tone: string }) {
  return <div className="admin-metric"><span className={`admin-metric-icon ${tone}`}>✳</span><span><small>{label}</small><strong>{count}</strong></span></div>;
}

function SafetyCard({ num, icon, title, copy }: { num: string; icon: string; title: string; copy: string }) {
  return <article className="safety-card"><div className="safety-card-top"><span className="safety-card-icon">{icon}</span><span>{num}</span></div><h3>{title}</h3><p>{copy}</p></article>;
}

function RideModal({ modal, landmarks, onClose, onSubmit, busy }: { modal: Loose; landmarks: string[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  const [kind, setKind] = useState<"offer" | "request">(modal.kind === "offer" ? "offer" : "request");
  const editing = Boolean(modal.rideId);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="ride-modal" role="dialog" aria-modal="true" aria-labelledby="rideModalTitle">
    <div className="modal-head"><div><p className="eyebrow">CAMPUS COMMUNITY RIDE</p><h2 id="rideModalTitle">{editing ? "Update your ride" : kind === "offer" ? "Offer a seat" : "Request a ride"}</h2><p>Share a route and time. We’ll suggest compatible matches.</p></div><button className="icon-button modal-close" onClick={onClose} aria-label="Close">×</button></div>
    <form className="ride-form" onSubmit={onSubmit}>
      {editing ? <><input type="hidden" name="kind" value={kind}/><div className="ride-kind-static"><span>{kind === "offer" ? "↗" : "⌖"}</span><b>{kind === "offer" ? "Your ride offer" : "Your ride request"}</b><small>Update the route and departure details below.</small></div></> : <div className="ride-kind-switch"><label className={kind === "request" ? "selected" : ""}><input type="radio" name="kind" value="request" checked={kind === "request"} onChange={() => setKind("request")}/> <span>⌖</span><b>I need a ride</b><small>Find a campus member going my way</small></label><label className={kind === "offer" ? "selected" : ""}><input type="radio" name="kind" value="offer" checked={kind === "offer"} onChange={() => setKind("offer")}/> <span>↗</span><b>I have a seat</b><small>Share an open seat on my route</small></label></div>}
      <datalist id="campus-landmarks">{landmarks.map((landmark: string) => <option key={landmark} value={landmark}/>)}</datalist>
      <div className="field-row"><label>Pickup location<input name="origin" list="campus-landmarks" placeholder="Choose a campus point" defaultValue={modal.origin || ""} required maxLength={100}/></label><label>Destination<input name="destination" list="campus-landmarks" placeholder="Where are you headed?" defaultValue={modal.destination || ""} required maxLength={100}/></label></div>
      <div className="field-row"><label>Departure date & time<input name="depart_at" type="datetime-local" min={localDateTime(new Date())} defaultValue={modal.depart_at || localDateTime()} required/></label>{kind === "offer" ? <label>Available seats<select name="seats" defaultValue={modal.seats || 2}>{Array.from({length:8},(_,i) => <option key={i+1} value={i+1}>{i+1} {i ? "seats" : "seat"}</option>)}</select></label> : <div className="ride-hint"><span>♧</span><p>Matches include verified members traveling on a similar route.</p></div>}</div>
      <label>Note to your match <span className="optional-label">OPTIONAL</span><textarea name="notes" rows={3} maxLength={280} placeholder={kind === "offer" ? "Vehicle or pickup details that may help your passenger…" : "A little more context about your trip…"} defaultValue={modal.notes || ""}/></label>
      <div className="modal-footer"><span>◇ No online payments in this version</span><div><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? <span className="spinner"/> : editing ? "Save changes" : kind === "offer" ? "Publish ride offer" : "Find my ride"}<span>↗</span></button></div></div>
    </form>
  </div></div>;
}
