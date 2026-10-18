import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUp,
  Bookmark,
  Check,
  Compass,
  Heart,
  MapPin,
  Menu,
  Moon,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react";

const API = "";
const categories = [
  { label: "Attractions", value: "tourism.attraction" },
  { label: "Sights", value: "tourism.sights" },
  { label: "Restaurants", value: "catering.restaurant" },
  { label: "Entertainment", value: "entertainment" },
  { label: "Hotels", value: "accommodation.hotel" },
];
const photos = [
  "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1000&q=85",
  "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1000&q=85",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=85",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1000&q=85",
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=85",
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1000&q=85",
];

function photoFor(place, index = 0) {
  return place.image || photos[(index + Math.abs(String(place.id || place.name).length)) % photos.length];
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function initialTheme() {
  const saved = window.localStorage.getItem("tripwise-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function Reveal({ children, className = "", delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || !("IntersectionObserver" in window)) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "0px 0px -48px 0px", threshold: 0.08 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${visible ? "is-visible" : ""} ${className}`} style={{ "--reveal-delay": `${delay}ms` }}>
      {children}
    </div>
  );
}

function EmptyIllustration({ compact = false }) {
  return (
    <span className={`empty-illustration ${compact ? "compact" : ""}`} aria-hidden="true">
      <Compass size={compact ? 23 : 29} strokeWidth={1.5} />
      <span className="illustration-spark"><Sparkles size={13} /></span>
    </span>
  );
}

export default function App() {
  const [page, setPage] = useState("explore");
  const [city, setCity] = useState("Chennai");
  const [cityInput, setCityInput] = useState("Chennai");
  const [category, setCategory] = useState("tourism.attraction");
  const [sort, setSort] = useState("relevance");
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState([]);
  const [itinerary, setItinerary] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [itineraryLoading, setItineraryLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [theme, setTheme] = useState(initialTheme);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#121914" : "#f7f6f0",
    );
    window.localStorage.setItem("tripwise-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    function onScroll() {
      setShowScrollTop(window.scrollY > 480);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!pendingRemoval) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setPendingRemoval(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingRemoval]);

  async function loadPlaces(nextCity = city, nextCategory = category, nextSort = sort) {
    setLoading(true);
    setError("");
    setCategory(nextCategory);
    try {
      const params = new URLSearchParams({ city: nextCity, category: nextCategory, sort: nextSort });
      const data = await request(`/api/destinations?${params}`);
      setPlaces(data.results || []);
      setCity(nextCity);
    } catch (loadError) {
      setError(loadError.message || "Could not load places.");
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadItinerary() {
    setItineraryLoading(true);
    try {
      const data = await request("/api/itinerary");
      setItinerary(data.items || []);
    } catch (loadError) {
      setNotice(`Itinerary unavailable: ${loadError.message}`);
    } finally {
      setItineraryLoading(false);
    }
  }

  useEffect(() => {
    loadPlaces();
    loadItinerary();
  }, []);

  const filtered = useMemo(() => {
    const searchTerm = query.trim().toLowerCase();
    return places.filter((place) =>
      `${place.name} ${place.address} ${place.city} ${place.category}`.toLowerCase().includes(searchTerm),
    );
  }, [places, query]);
  const savedIds = new Set(itinerary.map((item) => item.placeId));

  async function addPlace(place) {
    try {
      const data = await request("/api/itinerary", {
        method: "POST",
        body: JSON.stringify({
          placeId: String(place.id),
          name: place.name,
          city: place.city || city,
          lat: place.lat,
          lon: place.lon,
          category: place.category,
          image: place.image || null,
        }),
      });
      setItinerary((old) => [data.item, ...old.filter((item) => item.id !== data.item.id)]);
      setNotice(`${place.name} saved to My Trip`);
      setSelected(null);
    } catch (saveError) {
      setNotice(saveError.message);
    }
  }

  async function removePlace(item) {
    try {
      await request(`/api/itinerary/${item.id}`, { method: "DELETE" });
      setItinerary((old) => old.filter((savedItem) => savedItem.id !== item.id));
      setNotice(`${item.name} removed`);
    } catch (removeError) {
      setNotice(removeError.message);
    } finally {
      setPendingRemoval(null);
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    const nextCity = cityInput.trim();
    if (nextCity) loadPlaces(nextCity);
  }

  function showPage(nextPage) {
    setPage(nextPage);
    setSelected(null);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const viewKey = `${page}-${selected?.id || "list"}`;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#explore" onClick={(event) => { event.preventDefault(); showPage("explore"); }}>
          <span className="brand-mark"><Compass size={21} /></span>
          <span>tripwise<span className="brand-dot">.</span></span>
        </a>
        <button className="mobile-menu icon-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation">
          {mobileNav ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav className={mobileNav ? "nav-links nav-open" : "nav-links"} aria-label="Main navigation">
          <button className={page === "explore" ? "nav-link active" : "nav-link"} onClick={() => showPage("explore")}>Explore</button>
          <button className={page === "trip" ? "nav-link active" : "nav-link"} onClick={() => showPage("trip")}>
            My trip <span className="nav-count">{itinerary.length}</span>
          </button>
        </nav>
        <div className="topbar-right">
          <button
            className="theme-toggle icon-button"
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <span className="avatar">TW</span>
          <span className="profile-label">Your travel space</span>
        </div>
      </header>

      {notice && (
        <div className="toast" role="status" aria-live="polite">
          <Check size={16} />
          <span>{notice}</span>
          <button className="toast-close" onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={15} /></button>
        </div>
      )}

      {page === "explore" && !selected && (
        <main className="page-view" key={viewKey}>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow"><Sparkles size={14} /> YOUR NEXT CHAPTER STARTS HERE</div>
              <h1>Find your next<br /><em>somewhere.</em></h1>
              <p>Little-known corners, unforgettable landmarks, and places that make a trip yours.</p>
              <form className="search-panel" onSubmit={submitSearch}>
                <MapPin size={19} />
                <label className="search-label">
                  <span>Where to?</span>
                  <input value={cityInput} onChange={(event) => setCityInput(event.target.value)} placeholder="Try Chennai, Paris, Tokyo..." />
                </label>
                <button className="search-submit" type="submit" disabled={loading}><Search size={17} /><span>Explore</span></button>
              </form>
              <div className="hero-foot"><span className="live-dot" /> Discover real places around your destination</div>
            </div>
            <div className="hero-visual">
              <img src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1300&q=90" alt="Mountain lake travel landscape" />
              <div className="image-overlay" />
              <div className="hero-photo-caption"><span>THE WORLD IS WAITING</span><strong>Go a little further.</strong></div>
              <div className="floating-note"><span className="note-icon"><Heart size={17} /></span><span><strong>Made for your kind of trip</strong><small>Save places as you discover them</small></span></div>
            </div>
          </section>

          <section className="discover-section">
            <div className="section-heading">
              <div><div className="eyebrow muted">CURATED BY CURIOSITY</div><h2>Explore <em>somewhere new</em></h2></div>
              <div className="section-meta"><span className="live-dot" /> Places near <strong>{city}</strong></div>
            </div>
            <div className="toolbar">
              <div className="category-list" aria-label="Filter by category">
                {categories.map((item) => (
                  <button
                    key={item.value}
                    className={category === item.value ? "category-chip selected" : "category-chip"}
                    aria-pressed={category === item.value}
                    onClick={() => loadPlaces(city, item.value, sort)}
                  >{item.label}</button>
                ))}
              </div>
              <div className="filter-tools">
                <label className="inline-search"><Search size={15} /><input aria-label="Filter places" placeholder="Find a place..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
                <label className="sort-select"><ArrowDownUp size={15} /><select aria-label="Sort places" value={sort} onChange={(event) => { setSort(event.target.value); loadPlaces(city, category, event.target.value); }}><option value="relevance">Recommended</option><option value="name">Name A–Z</option><option value="name-desc">Name Z–A</option></select></label>
              </div>
            </div>

            {error && <div className="error-box" role="alert"><strong>We couldn't load destinations.</strong><span>{error}</span><button onClick={() => loadPlaces()}>Try again</button></div>}
            {loading && <div className="place-grid" aria-label="Loading destinations">{[1, 2, 3, 4, 5, 6].map((number) => <div className="skeleton-card" key={number}><div className="skeleton-img" /><div className="skeleton-line" /><div className="skeleton-line short" /></div>)}</div>}
            {!loading && !error && filtered.length > 0 && (
              <div className="place-grid">
                {filtered.map((place, index) => (
                  <Reveal key={place.id} className="place-reveal" delay={Math.min(index % 9, 8) * 45}>
                    <article className="place-card">
                      <button className="place-image-button" onClick={() => setSelected(place)} aria-label={`View ${place.name}`}>
                        <img className="place-image" src={photoFor(place, index)} alt={place.name} loading="lazy" />
                        <span className="image-badge">{categoryLabel(place.category)}</span>
                      </button>
                      <div className="place-content">
                        <div className="place-location"><MapPin size={13} />{place.city || city}</div>
                        <h3>{place.name}</h3>
                        <p>{place.address || "A place worth discovering."}</p>
                        <div className="place-card-bottom">
                          <button className="text-action" onClick={() => setSelected(place)}>Explore details <ArrowRight size={15} /></button>
                          <button className={savedIds.has(String(place.id)) ? "save-button saved" : "save-button"} onClick={() => addPlace(place)} aria-label="Save to itinerary" title="Save to My Trip">
                            {savedIds.has(String(place.id)) ? <Check size={17} /> : <Bookmark size={17} />}
                          </button>
                        </div>
                      </div>
                    </article>
                  </Reveal>
                ))}
              </div>
            )}
            {!loading && !error && filtered.length === 0 && (
              <div className="empty-state">
                <EmptyIllustration compact />
                <h3>No places found just yet</h3>
                <p>Try another search or category, or explore a different city.</p>
                <button className="secondary-button" onClick={() => { setQuery(""); loadPlaces(city); }}>Reset filters</button>
              </div>
            )}
          </section>
        </main>
      )}

      {page === "explore" && selected && (
        <main className="detail-page page-view" key={viewKey}>
          <button className="back-link" onClick={() => setSelected(null)}><ArrowRight size={15} /> Back to explore</button>
          <div className="detail-layout">
            <div className="detail-image"><img src={photoFor(selected, 2)} alt={selected.name} /><span className="image-badge">{categoryLabel(selected.category)}</span></div>
            <div className="detail-copy">
              <div className="eyebrow muted"><MapPin size={14} /> {selected.city || city}</div>
              <h1>{selected.name}</h1>
              <p className="detail-address">{selected.address}</p>
              <p className="detail-description">Add this place to your trip to keep your discoveries together. Explore nearby sights, local favourites, and the places that make {selected.city || city} special.</p>
              <div className="detail-facts">
                <span><MapPin size={17} /><span><small>LOCATION</small><strong>{selected.city || city}</strong></span></span>
                <span><Compass size={17} /><span><small>DISCOVER</small><strong>{categoryLabel(selected.category)}</strong></span></span>
              </div>
              <button className="primary-button wide" onClick={() => addPlace(selected)}>{savedIds.has(String(selected.id)) ? <Check size={17} /> : <Bookmark size={17} />} {savedIds.has(String(selected.id)) ? "Saved to My Trip" : "Add to My Trip"} <ArrowRight size={17} /></button>
            </div>
          </div>
        </main>
      )}

      {page === "trip" && (
        <main className="trip-page page-view" key={viewKey}>
          <div className="eyebrow muted">YOUR PERSONAL COLLECTION</div>
          <div className="trip-title-row"><div><h1>My <em>trip.</em></h1><p>Every great journey starts with a few saved places.</p></div><span className="trip-count">{itinerary.length} {itinerary.length === 1 ? "place" : "places"}</span></div>
          {itineraryLoading ? <div className="empty-state"><div className="spinner" /><p>Loading your saved places…</p></div> :
            itinerary.length === 0 ? (
              <div className="empty-state trip-empty">
                <EmptyIllustration />
                <h3>Your next adventure starts here</h3>
                <p>Explore destinations and save the places you don't want to forget.</p>
                <button className="primary-button" onClick={() => showPage("explore")}>Explore destinations <ArrowRight size={16} /></button>
              </div>
            ) : (
              <div className="trip-list">{itinerary.map((item, index) => (
                <Reveal key={item.id} className="trip-reveal" delay={index * 50}>
                  <article className="trip-item">
                    <img src={photoFor(item, index)} alt={item.name} />
                    <div className="trip-item-info"><span className="place-location"><MapPin size={13} />{item.city || "Saved destination"}</span><h3>{item.name}</h3><p>{item.category ? categoryLabel(item.category) : "Destination"}</p></div>
                    <button className="remove-button" onClick={() => setPendingRemoval(item)}><Trash2 size={16} /><span>Remove</span></button>
                  </article>
                </Reveal>
              ))}</div>
            )
          }
          {itinerary.length > 0 && <button className="secondary-button add-more" onClick={() => showPage("explore")}>Discover more places <ArrowRight size={15} /></button>}
        </main>
      )}

      <footer className="footer">
        <a className="brand footer-brand" href="#explore" onClick={(event) => { event.preventDefault(); showPage("explore"); }}><span className="brand-mark"><Compass size={18} /></span><span>tripwise<span className="brand-dot">.</span></span></a>
        <span>Collect places. Make memories.</span>
        <span>Built for curious travellers <Sparkles size={13} /></span>
      </footer>

      {showScrollTop && <button className="scroll-top icon-button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Scroll to top" title="Scroll to top"><ArrowUp size={18} /></button>}

      {pendingRemoval && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingRemoval(null); }}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-title" aria-describedby="remove-description">
            <span className="dialog-icon"><Trash2 size={19} /></span>
            <h2 id="remove-title">Remove this place?</h2>
            <p id="remove-description"><strong>{pendingRemoval.name}</strong> will be removed from your saved trip.</p>
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setPendingRemoval(null)}>Keep place</button>
              <button className="danger-button" onClick={() => removePlace(pendingRemoval)}><Trash2 size={15} /> Remove</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function categoryLabel(category = "") {
  const normalized = String(category).toLowerCase();
  if (normalized.includes("restaurant") || normalized.includes("catering")) return "Food & drink";
  if (normalized.includes("hotel") || normalized.includes("accommodation")) return "Stay";
  if (normalized.includes("entertainment")) return "Entertainment";
  if (normalized.includes("sights")) return "Landmark";
  return "Attraction";
}