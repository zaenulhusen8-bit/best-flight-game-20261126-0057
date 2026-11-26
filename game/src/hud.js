// hud.js — the lit instruments. Two jobs: the DOM readouts (altitude, speed,
// heading, throttle, fuel, damage, mission) and the painted instrument panel:
// an artificial horizon, a compass strip, and airspeed/altitude dials. The
// panel is drawn every frame so the needles move with the flight model.

import { headingDegrees, knots, altitudeAgl } from './aircraft.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.panel = $('panel').getContext('2d');
    this.messageTimer = 0;
  }

  showMessage(text, sub, seconds = 3) {
    $('message').textContent = text;
    $('submessage').textContent = sub || '';
    this.messageTimer = seconds;
  }

  tickMessage(dt) {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) {
        $('message').textContent = '';
        $('submessage').textContent = '';
      }
    }
  }

  update(state, runner, groundAt) {
    $('alt').textContent = `${Math.round(altitudeAgl(state, groundAt))} m`;
    $('spd').textContent = `${Math.round(knots(state))} kt`;
    $('hdg').textContent = `${String(Math.round(headingDegrees(state))).padStart(3, '0')}°`;
    $('thr').textContent = `${Math.round(state.throttle * 100)}%`;
    $('missionTitle').textContent = runner.mission.title;
    $('missionGoal').textContent = runner.mission.goal;
    $('missionProgress').textContent = runner.progressText();
    const t = runner.mission.timeLimit;
    $('missionTimer').textContent = t
      ? `${Math.max(0, t - runner.elapsed).toFixed(1)} s left`
      : (runner.done ? 'MISSION COMPLETE' : runner.failed ? 'MISSION FAILED' : '');
    $('fuelPct').textContent = `${Math.round(state.fuel)}%`;
    $('fuelFill').style.width = `${state.fuel}%`;
    $('dmgPct').textContent = `${Math.round(state.damage)}% damage`;
    $('dmgFill').style.width = `${state.damage}%`;
    this.drawPanel(state, groundAt);
  }

  drawPanel(state, groundAt) {
    const ctx = this.panel;
    const W = 460, H = 120;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    // Panel face.
    ctx.fillStyle = 'rgba(8, 26, 42, 0.85)';
    ctx.fillRect(0, 0, W, H);

    // --- artificial horizon (left) ---
    const cx = 70, cy = 60, r = 48;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-state.bank);
    ctx.translate(0, state.pitch * r * 1.4);
    ctx.fillStyle = '#2f7fc4'; ctx.fillRect(-r, -r * 2, r * 2, r * 2); // sky
    ctx.fillStyle = '#7a5230'; ctx.fillRect(-r, 0, r * 2, r * 2); // ground
    ctx.fillStyle = '#eaf6ff'; ctx.fillRect(-r, -1.5, r * 2, 3); // horizon line
    ctx.restore();
    ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // Fixed wings marker.
    ctx.fillStyle = '#ffd23e';
    ctx.fillRect(cx - 34, cy - 2, 22, 4);
    ctx.fillRect(cx + 12, cy - 2, 22, 4);
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9fd8ff'; ctx.font = 'bold 11px Verdana'; ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', cx, cy + r + 14);

    // --- compass strip (centre) ---
    const hdg = headingDegrees(state);
    const ccx = 230, ccy = 34;
    ctx.fillStyle = '#0a2036'; ctx.fillRect(ccx - 110, ccy - 16, 220, 32);
    ctx.strokeStyle = 'rgba(159,216,255,0.5)'; ctx.strokeRect(ccx - 110, ccy - 16, 220, 32);
    ctx.font = 'bold 13px Verdana'; ctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 15) {
      const a = (Math.round(hdg / 15) * 15 + d + 360) % 360;
      const x = ccx + d * 1.7;
      const label = a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a).padStart(3, '0');
      ctx.fillStyle = a % 90 === 0 ? '#ffd23e' : '#cfeeff';
      ctx.fillText(label, x, ccy + 5);
      ctx.fillRect(x - 0.5, ccy + 10, 1, 5);
    }
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath(); ctx.moveTo(ccx, ccy - 16); ctx.lineTo(ccx - 5, ccy - 24); ctx.lineTo(ccx + 5, ccy - 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9fd8ff'; ctx.font = '11px Verdana';
    ctx.fillText('HEADING', ccx, ccy + 30);

    // --- airspeed dial (right of centre) ---
    this.dial(ctx, 340, 60, 30, knots(state), 200, 'KT', '#37d67a');
    // --- altitude dial (far right) ---
    this.dial(ctx, 415, 60, 30, altitudeAgl(state, groundAt), 600, 'M', '#ff9d5c');

    ctx.restore();
  }

  dial(ctx, cx, cy, r, value, max, unit, color) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#0a2036'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    const frac = Math.max(0, Math.min(1, value / max));
    const angle = -Math.PI * 0.75 + frac * Math.PI * 1.5;
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * (r - 4), cy + Math.sin(angle) * (r - 4));
    ctx.stroke();
    ctx.fillStyle = '#eaf6ff'; ctx.font = 'bold 12px Verdana'; ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(value)), cx, cy + 4);
    ctx.fillStyle = '#9fd8ff'; ctx.font = '10px Verdana';
    ctx.fillText(unit, cx, cy + r + 12);
  }
}
