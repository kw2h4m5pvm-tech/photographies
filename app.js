const app = document.getElementById("app");
const top_ = document.querySelector(".crumbs");
const themeBtn = document.querySelector(".theme");
const lb = document.getElementById("lightbox");
const lbImg = lb.querySelector("img");

// Index des lieux par identifiant, avec leur parent
const nodes = {};
(function walk(list, parent) {
  list.forEach(n => { n.parent = parent; nodes[n.id] = n; if (n.children) walk(n.children, n); });
})(PLACES, null);

const lastSeen = {}; // dernier lieu vu dans chaque défilement, pour y revenir
let slider = null;   // défilement affiché
let current = null;  // lieu affiché en mosaïque
let index = 0;       // photo ouverte dans la visionneuse

const pad = n => String(n).padStart(2, "0");
const total = n => n.children ? n.children.reduce((s, c) => s + total(c), 0) : n.photos.length;

// Mode clair / sombre : clair par défaut, sauf si le visiteur a choisi le sombre
const dark = () => document.documentElement.dataset.theme === "dark";
const themeLabel = () => { themeBtn.textContent = dark() ? "Mode clair" : "Mode sombre"; };
themeBtn.onclick = () => {
  const t = dark() ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch (e) {}
  themeLabel();
};
themeLabel();

function crumbs(node) {
  const chain = [];
  for (let n = node; n; n = n.parent) chain.unshift(n);
  chain.unshift({ id: "lieux", name: "Lieux" });
  top_.innerHTML = chain.map((n, k) =>
    k === chain.length - 1 ? `<span class="here">${n.name}</span>` : `<a href="#/${n.id}">${n.name}</a>`
  ).join(`<span class="sep">/</span>`);
}

function showHome() {
  current = { name: "Sélection", photos: FAVORITES };
  app.innerHTML = `
    <div class="home">
      ${FAVORITES.map((p, i) => `
        <figure class="feature f${i % 3}${p.h > p.w ? " portrait" : ""}" style="--r: ${(p.w / p.h).toFixed(3)}">
          <img src="${p.l}" width="${p.w}" height="${p.h}" alt="" loading="lazy" data-i="${i}">
          <figcaption>
            <span class="label">${pad(i + 1)}</span>
            ${p.place ? `<a href="#/${p.place.id}">${p.place.name}<span class="label">Voir la série →</span></a>` : ""}
          </figcaption>
        </figure>`).join("")}
      <a class="next-place" href="#/lieux"><span class="label">Continuer</span><span class="name">Tous les lieux →</span></a>
      <div class="scroll-hint" aria-hidden="true"><span class="label">Défiler</span><i></i></div>
    </div>`;
  // Chaque photo apparaît en fondu quand on arrive dessus
  const seen = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); seen.unobserve(e.target); }
  }), { rootMargin: "0px 0px -30% 0px" });
  app.querySelectorAll(".feature").forEach(f => seen.observe(f));
  app.querySelectorAll(".feature img").forEach(img => img.addEventListener("click", () => open(+img.dataset.i)));
}

function showSlider(group) {
  const list = group ? group.children : PLACES;
  const key = group ? group.id : "";
  app.innerHTML = `
    <div class="slider">
      <div class="track">
        ${list.map(n => `
          <div class="slide">
            <a href="#/${n.id}"><img src="${n.cover.l}" width="${n.cover.w}" height="${n.cover.h}" alt="${n.name}"></a>
            <div class="caption">
              <h2>${n.name}</h2>
              <span class="label">${n.children ? `${n.children.length} lieux — ` : ""}${total(n)} photos</span>
            </div>
          </div>`).join("")}
      </div>
      <button class="arrow prev" aria-label="Lieu précédent">←</button>
      <button class="arrow next" aria-label="Lieu suivant">→</button>
      <div class="count label"></div>
    </div>`;
  const track = app.querySelector(".track");
  const slides = [...app.querySelectorAll(".slide")];
  const prev = app.querySelector(".prev");
  const next = app.querySelector(".next");
  const count = app.querySelector(".count");

  slider = {
    i: 0,
    go(i) {
      i = Math.max(0, Math.min(list.length - 1, i));
      this.i = i;
      lastSeen[key] = list[i].id;
      track.style.setProperty("--i", i);
      slides.forEach((s, k) => s.classList.toggle("on", k === i));
      prev.disabled = i === 0;
      next.disabled = i === list.length - 1;
      count.textContent = `${pad(i + 1)} / ${pad(list.length)}`;
    },
    enter() { location.hash = "#/" + list[this.i].id; },
  };
  prev.onclick = () => slider.go(slider.i - 1);
  next.onclick = () => slider.go(slider.i + 1);
  // Un clic sur un lieu voisin le fait venir au centre au lieu de l'ouvrir
  slides.forEach((s, k) => s.querySelector("a").addEventListener("click", e => {
    if (k !== slider.i) { e.preventDefault(); slider.go(k); }
  }));
  slider.go(Math.max(0, list.findIndex(n => n.id === lastSeen[key])));
}

function showSeries(s) {
  current = s;
  if (s.parent) lastSeen[s.parent.id] = s.id;
  const siblings = s.parent ? s.parent.children : PLACES;
  const next = siblings[(siblings.indexOf(s) + 1) % siblings.length];
  app.innerHTML = `
    <div class="series">
      <div class="series-head">
        <h1>${s.name}</h1>
        <span class="label">${s.photos.length} photos</span>
      </div>
      <div class="grid">
        ${s.photos.map((p, i) => `<figure data-i="${i}" data-r="${p.h / p.w}"><img src="${p.s}" width="${p.w}" height="${p.h}" alt="${s.name} ${i + 1}" loading="lazy"></figure>`).join("")}
      </div>
      <a class="next-place" href="#/${next.id}"><span class="label">Lieu suivant</span><span class="name">${next.name} →</span></a>
    </div>`;
  app.querySelectorAll(".grid img").forEach(img => {
    if (img.complete) img.classList.add("loaded");
    else img.onload = () => img.classList.add("loaded");
  });
  app.querySelectorAll(".grid figure").forEach(f => f.addEventListener("click", () => open(+f.dataset.i)));
  layoutGrid();
}

// Mosaïque : chaque photo, dans l'ordre de la série, va dans la colonne la plus courte
function layoutGrid() {
  const grid = app.querySelector(".grid");
  if (!grid) return;
  const n = innerWidth <= 700 ? 1 : innerWidth < 1100 ? 2 : 3;
  if (grid.dataset.n == n) return;
  grid.dataset.n = n;
  const figs = [...grid.querySelectorAll("figure")].sort((a, b) => a.dataset.i - b.dataset.i);
  const cols = Array.from({ length: n }, () => Object.assign(document.createElement("div"), { className: "col" }));
  const heights = cols.map(() => 0);
  figs.forEach(f => {
    const k = heights.indexOf(Math.min(...heights));
    cols[k].appendChild(f);
    heights[k] += +f.dataset.r;
  });
  grid.replaceChildren(...cols);
}
window.addEventListener("resize", layoutGrid);

// Une photo noir et blanc ouverte en grand passe le site en sombre, le temps de la regarder
let themeBeforeLb; // mode du visiteur, rétabli à la fermeture
function setTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  themeLabel();
}

function open(i) {
  if (lb.hidden) themeBeforeLb = document.documentElement.dataset.theme;
  index = (i + current.photos.length) % current.photos.length;
  setTheme(current.photos[index].bw ? "dark" : themeBeforeLb);
  lbImg.src = current.photos[index].l;
  lb.querySelector(".lb-count").textContent = `${current.name} — ${index + 1} / ${current.photos.length}`;
  lb.hidden = false;
  document.body.style.overflow = "hidden";
  new Image().src = current.photos[(index + 1) % current.photos.length].l; // précharge la suivante
}

function close() {
  if (!lb.hidden) setTheme(themeBeforeLb);
  lb.hidden = true;
  document.body.style.overflow = "";
}

// Fermer la visionneuse ramène la page sur la dernière photo regardée
function closeToPhoto() {
  close();
  const el = app.querySelector(`[data-i="${index}"]`);
  el.closest(".feature")?.classList.add("in");
  el.scrollIntoView({ block: "center" });
}

function route() {
  close();
  slider = current = null;
  const id = location.hash.slice(2);
  const node = nodes[id];
  const home = !node && id !== "lieux";
  document.querySelectorAll(".menu a").forEach(a => a.classList.toggle("here", (a.dataset.tab === "home") === home));
  if (home) {
    top_.innerHTML = "";
    showHome();
  } else {
    crumbs(node);
    node && !node.children ? showSeries(node) : showSlider(node);
  }
  window.scrollTo(0, 0);
}

lb.querySelector(".lb-close").onclick = closeToPhoto;
lb.querySelector(".lb-prev").onclick = () => open(index - 1);
lb.querySelector(".lb-next").onclick = () => open(index + 1);
lbImg.onclick = () => open(index + 1);

document.addEventListener("keydown", e => {
  if (!lb.hidden) {
    if (e.key === "Escape") closeToPhoto();
    if (e.key === "ArrowRight") open(index + 1);
    if (e.key === "ArrowLeft") open(index - 1);
  } else if (slider) {
    if (e.key === "ArrowRight") slider.go(slider.i + 1);
    if (e.key === "ArrowLeft") slider.go(slider.i - 1);
    if (e.key === "Enter") slider.enter();
  }
});

// Molette : un cran = un lieu
let wheelLock = 0;
document.addEventListener("wheel", e => {
  if (!slider || !lb.hidden) return;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(d) < 20 || Date.now() < wheelLock) return;
  wheelLock = Date.now() + 900;
  slider.go(slider.i + (d > 0 ? 1 : -1));
});

// Glisser du doigt
let touchX = 0;
document.addEventListener("touchstart", e => { touchX = e.touches[0].clientX; }, { passive: true });
document.addEventListener("touchend", e => {
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) < 50) return;
  if (!lb.hidden) open(index + (dx < 0 ? 1 : -1));
  else if (slider) slider.go(slider.i + (dx < 0 ? 1 : -1));
});

// L'invitation à défiler s'efface dès qu'on descend
window.addEventListener("scroll", () => {
  const hint = app.querySelector(".scroll-hint");
  if (hint) hint.classList.toggle("gone", scrollY > 40);
}, { passive: true });

window.addEventListener("hashchange", route);
route();
