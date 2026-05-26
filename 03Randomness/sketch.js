// Simple typing system:
// - Type letters to build a line (centered).
// - Press SPACE: scatter current word's letters (random drift).
// - Line break (ENTER or auto-wrap): letters snap back to home.

const W = 700;
const H = 700;
const PAGE_BG = 235;
const INK = 20;

let chars = [];
let fontSize = 15;
let lineHeight;
let canvas;

function setup() {
  canvas = createCanvas(W, H);
  canvas.elt.tabIndex = 0;
  canvas.elt.style.outline = "none";
  canvas.elt.style.border = "none";
  canvas.elt.focus();

  document.body.style.margin = "0";
  document.body.style.display = "grid";
  document.body.style.placeItems = "center";
  document.body.style.minHeight = "100vh";

  textFont("Helvetica");
  textSize(fontSize);
  textAlign(LEFT, BASELINE);
  lineHeight = fontSize * 1.25;
}

function draw() {
  background(PAGE_BG);

  // 1) compute "home" positions based on current text (centered)
  layoutHomePositions();

  // 2) update + draw every letter
  for (let L of chars) {
    L.update();
    L.draw();
  }
}

function mousePressed() {
  canvas.elt.focus();
}

function keyPressed() {
  // ENTER => new line + snap back
  if (keyCode === ENTER || keyCode === RETURN) {
    chars.push(new Letter("\n"));
    snapAllBack();
    return false;
  }

  // BACKSPACE => delete last
  if (keyCode === BACKSPACE) {
    chars.pop();
    return false;
  }

  // SPACE => scatter current word, then add a space
  if (keyCode === 32) {
    scatterCurrentWord();
    chars.push(new Letter(" "));
    autoWrapIfNeeded();
    return false;
  }

  return true;
}

function keyTyped() {
  // add normal characters (ignore control keys)
  if (key.length === 1 && key !== " ") {
    chars.push(new Letter(key));
    autoWrapIfNeeded();
  }
  return false;
}

/* ---------- Core behaviors ---------- */

function scatterCurrentWord() {
  // scan backward until we hit a space or newline
  let i = chars.length - 1;

  // skip trailing spaces
  while (i >= 0 && chars[i].ch === " ") i--;

  // collect current word letters
  let word = [];
  while (i >= 0) {
    let ch = chars[i].ch;
    if (ch === " " || ch === "\n") break;
    word.push(chars[i]);
    i--;
  }

  // give each letter a random drifting velocity
  for (let L of word) {
    L.scattered = true;
    L.vx += random(-6, 3);
    L.vy += random(-6, 3);
  }
}

function snapAllBack() {
  for (let L of chars) {
    L.scattered = false;
    L.vx = 0;
    L.vy = 0;
    if (isFinite(L.homeX) && isFinite(L.homeY)) {
      L.x = L.homeX;
      L.y = L.homeY;
    }
  }
}

function autoWrapIfNeeded() {
  // if current line too wide => line break + snap back
  let safeW = width * 0.9;
  let lineStr = getCurrentLineString();
  if (textWidth(lineStr) > safeW) {
    chars.push(new Letter("\n"));
    snapAllBack();
  }
}

function getCurrentLineString() {
  let s = "";
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i].ch === "\n") break;
    s = chars[i].ch + s;
  }
  return s;
}

/* ---------- Centered layout ---------- */

function layoutHomePositions() {
  // split into lines by "\n"
  let lines = [];
  let current = [];
  for (let L of chars) {
    if (L.ch === "\n") {
      lines.push(current);
      current = [];
    } else {
      current.push(L);
    }
  }
  lines.push(current);

  // vertical center for the whole block
  let blockH = lines.length * lineHeight;
  let topY = height / 2 - blockH / 2 + fontSize;

  // assign home position per line
  for (let li = 0; li < lines.length; li++) {
    let lineArr = lines[li];
    let lineStr = lineArr.map(L => L.ch).join("");
    let startX = width / 2 - textWidth(lineStr) / 2;
    let y = topY + li * lineHeight;

    let x = startX;
    for (let L of lineArr) {
      L.homeX = x;
      L.homeY = y;
      x += textWidth(L.ch);
    }
  }
}

/* ---------- Letter object ---------- */

class Letter {
  constructor(ch) {
    this.ch = ch;
    this.homeX = NaN;
    this.homeY = NaN;
    this.x = NaN;
    this.y = NaN;
    this.vx = 0;
    this.vy = 0;
    this.scattered = false;
    this.size = fontSize;
  }

  update() {
    // init position at home once we know it
    if (!isFinite(this.x) && isFinite(this.homeX)) {
      this.x = this.homeX;
      this.y = this.homeY;
    }

    if (this.scattered) {
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= 0.98;
      this.vy *= 0.98;
      this.size = lerp(this.size, fontSize * 2, 0.01);
    } else {
      // stick to home
      if (isFinite(this.homeX)) {
        this.x = this.homeX;
        this.y = this.homeY;
        this.size = lerp(this.size, fontSize, 0.1);
      }
    }
  }

  draw() {
    if (this.ch === " " || this.ch === "\n") return;

    textSize(this.size);
    fill(INK);
    noStroke();
    text(this.ch, this.x, this.y);
  }
}
