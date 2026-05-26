const W = 800;
const H = 800;

const FONT_SIZE = 20;
const STEP = 20;
const MARGIN = 20;

const CURSOR_LEN = 20;
const CURSOR_WEIGHT = 1.5;

const TURN_MARK_SIZE = FONT_SIZE;
const SQUARE_START = FONT_SIZE;
const SQUARE_MAX = W * 1.8;
const SQUARE_GROWTH = 2.5;

const INK = "#ff1f1f";
const PAGE_BG = "#fff200";
const TURN_MARK = "#fff8ef";
const PALETTE = [
  "#f190df",
  "#ff2f2f",
  "#ff9aa4",
  "#8c00ff",
  "#c8f000",
  "#68c99a",
  "#00e565",
  "#ff6614",
  "#fff500",
  "#00b6f0",
  "#d296ff",
  "#dcf56d"
];

let chars = [];
let squares = [];
let turnMarks = [];
let history = [];
let dir = 0;
let pen;
let canvas;
let nextSquareId = 1;
let lastHandledKey = "";
let lastTypedFrame = -1;
let lastTurnTime = -1000;

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
  textStyle(BOLD);
  textSize(FONT_SIZE);
  textAlign(CENTER, CENTER);

  pen = { x: W / 2, y: H / 2 };

  window.addEventListener("keydown", handleKeyDown, true);
}

function draw() {
  background(PAGE_BG);

  drawSquares();
  blendMode(BLEND);

  fill(INK);
  noStroke();

  for (let c of chars) {
    push();
    translate(c.x, c.y);
    rotate(c.rot);
    text(c.char, 0, 0);
    pop();
  }

  drawTurnMarks();
  drawCursor();
}

function drawSquares() {
  blendMode(BLEND);
  drawingContext.globalCompositeOperation = "source-over";
  noStroke();
  rectMode(CENTER);

  for (let i = 0; i < squares.length; i++) {
    const s = squares[i];

    fill(s.col);
    rect(s.x, s.y, s.size, s.size);

    s.size = min(s.size + SQUARE_GROWTH, SQUARE_MAX);
  }
}

function drawTurnMarks() {
  rectMode(CENTER);
  fill(TURN_MARK);
  noStroke();

  for (let mark of turnMarks) {
    rect(mark.x, mark.y, TURN_MARK_SIZE, TURN_MARK_SIZE);
  }
}

function drawCursor() {
  push();
  stroke(INK);
  strokeWeight(CURSOR_WEIGHT);

  if (dir === 0) line(pen.x, pen.y, pen.x + CURSOR_LEN, pen.y);
  if (dir === 1) line(pen.x, pen.y, pen.x, pen.y + CURSOR_LEN);
  if (dir === 2) line(pen.x, pen.y, pen.x - CURSOR_LEN, pen.y);
  if (dir === 3) line(pen.x, pen.y, pen.x, pen.y - CURSOR_LEN);

  pop();
}

function handleKeyDown(event) {
  event = event || {};

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  if (alreadyHandled(event)) {
    event.preventDefault();
    return;
  }

  if (event.key === "Backspace") {
    undoLastInput();
    preventDefault(event);
    return;
  }

  const value = event.key || key;

  if (isTurnKey(value, event)) {
    addTurn();
    preventDefault(event);
    return;
  }

  if (value.length !== 1) {
    return;
  }

  chars.push({
    char: value,
    x: pen.x,
    y: pen.y,
    rot: dir * HALF_PI
  });

  history.push({
    type: "char",
    pen: { x: pen.x, y: pen.y }
  });

  advance();

  preventDefault(event);
}

function alreadyHandled(event) {
  const signature = `${event.key || key}-${event.code || keyCode}-${event.timeStamp || frameCount}`;

  if (signature === lastHandledKey) {
    return true;
  }

  lastHandledKey = signature;
  return false;
}

function preventDefault(event) {
  if (event && event.preventDefault) {
    event.preventDefault();
  }
}

function isTurnKey(value, event) {
  return (
    value === "," ||
    value === "." ||
    value === "，" ||
    value === "。" ||
    value === "!" ||
    value === "?" ||
    (event && event.code === "Comma") ||
    (event && event.code === "Period") ||
    (event && event.keyCode === 188) ||
    (event && event.keyCode === 190) ||
    (event && event.shiftKey && event.code === "Digit1") ||
    (event && event.shiftKey && event.code === "Slash")
  );
}

function mousePressed() {
  canvas.elt.focus();
}

function keyPressed(event) {
  handleKeyDown(event);
  return false;
}

function keyTyped() {
  if (frameCount === lastTypedFrame) {
    return false;
  }

  lastTypedFrame = frameCount;

  if (millis() - lastTurnTime < 80) {
    return false;
  }

  if (isTurnKey(key, null)) {
    addTurn();
    return false;
  }

  return false;
}

function addTurn() {
  lastTurnTime = millis();

  const squareId = addSquarePulse();
  const markId = addTurnMark();

  history.push({
    type: "turn",
    dir,
    squareId,
    markId
  });

  dir = (dir + 1) % 4;
}

function addSquarePulse() {
  const id = nextSquareId++;

  squares.push({
    id,
    x: pen.x,
    y: pen.y,
    size: SQUARE_START,
    col: randomPaletteColor()
  });

  return id;
}

function randomPaletteColor() {
  const a = color(random(PALETTE));
  const b = color(random(PALETTE));
  const c = lerpColor(a, b, random(0.25, 0.75));
  c.setAlpha(179);
  return c;
}

function addTurnMark() {
  const id = nextSquareId++;

  turnMarks.push({
    id,
    x: pen.x,
    y: pen.y
  });

  return id;
}

function undoLastInput() {
  const last = history.pop();

  if (!last) {
    return;
  }

  if (last.type === "char") {
    chars.pop();
    pen.x = last.pen.x;
    pen.y = last.pen.y;
  }

  if (last.type === "turn") {
    dir = last.dir;
    squares = squares.filter((s) => s.id !== last.squareId);
    turnMarks = turnMarks.filter((mark) => mark.id !== last.markId);
  }
}

function advance() {
  if (dir === 0) pen.x += STEP;
  if (dir === 1) pen.y += STEP;
  if (dir === 2) pen.x -= STEP;
  if (dir === 3) pen.y -= STEP;
}
