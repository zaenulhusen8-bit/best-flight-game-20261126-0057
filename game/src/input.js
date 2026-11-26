// input.js — keyboard and mouse. One job: turn keys and the pointer into a
// stick: pitch (-1..1, positive = pull up), bank (-1..1, positive = right) and
// a throttle delta per second. The game loop reads `stick` every frame.

export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseX = 0; // -1..1 across the window
    this.mouseY = 0;
    this.mouseActive = false;
    this.pressed = new Set(); // edge-triggered keys, consumed by the game
    this.stick = { pitch: 0, bank: 0, throttleDelta: 0 };
    this.onKey = null; // (code) => void, for menu shortcuts

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (this.onKey) this.onKey(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousemove', (e) => {
      this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseY = (e.clientY / window.innerHeight) * 2 - 1;
      this.mouseActive = true;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseActive = true;
    });
  }

  wasPressed(code) {
    const hit = this.pressed.has(code);
    this.pressed.delete(code);
    return hit;
  }

  // Recompute the stick from the current keys and pointer.
  poll() {
    let pitch = 0, bank = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) pitch += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) pitch -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) bank -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) bank += 1;
    // Mouse steers gently: hold the pointer off-centre to bank and pitch.
    if (this.mouseActive && Math.abs(this.mouseX) > 0.12) {
      bank += this.mouseX * 0.7;
    }
    if (this.mouseActive && Math.abs(this.mouseY) > 0.18) {
      pitch -= this.mouseY * 0.5;
    }
    let throttleDelta = 0;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) throttleDelta += 0.55;
    if (this.keys.has('ControlLeft') || this.keys.has('ControlRight')) throttleDelta -= 0.55;
    this.stick.pitch = Math.max(-1, Math.min(1, pitch));
    this.stick.bank = Math.max(-1, Math.min(1, bank));
    this.stick.throttleDelta = throttleDelta;
    return this.stick;
  }
}
